import { createMachine, assign } from 'xstate';
import * as visitorService from './services/visitorService.js';

export const checkInMachine = createMachine(
  {
    id: 'checkInApp',
    initial: 'AUTH_PENDING',
    context: {
      masterFileId:          null,
      masterFileName:        null,
      orphanFileId:          null,
      selectedVisitor:       null,
      scanCandidate:         null,
      setupError:            null,
      syncError:             null,
      reauthError:           null,
      toastPending:          false,
      retriggerPicker:       false,
      pendingAttendanceCount: 0,
      syncedCount:            0,
    },

    states: {
      AUTH_PENDING: {
        on: {
          AUTH_SUCCESS: [
            { guard: 'visitorStoreEmpty',    target: 'FILE_PICKER_PENDING' },
            { guard: 'visitorStoreHydrated', target: 'ATTENDANCE_PHASE' },
          ],
        },
      },

      FILE_PICKER_PENDING: {
        initial: 'AWAITING_SELECTION',
        states: {
          AWAITING_SELECTION: {
            entry: 'openPickerIfRetrigger',
            on: {
              FILE_PICKED: {
                target: 'CONFIRMING_SELECTION',
                actions: 'storeMasterFileId',
              },
            },
          },
          CONFIRMING_SELECTION: {
            entry: 'clearRetriggerPicker',
            on: {
              FILE_CONFIRMED: 'CHECKING_COLLISION',
              FILE_REJECTED: {
                target: 'AWAITING_SELECTION',
                actions: 'setRetriggerPicker',
              },
            },
          },
          CHECKING_COLLISION: {
            on: {
              COLLISION_NOT_FOUND: 'COPYING_FILE',
              COLLISION_FOUND: {
                target: 'COLLISION_PROMPT',
                actions: 'storeOrphanFileId',
              },
              COLLISION_CHECK_FAILED: {
                target: 'AWAITING_SELECTION',
                actions: 'showCollisionCheckError',
              },
            },
          },
          COLLISION_PROMPT: {
            on: {
              USE_EXISTING_FILE: {
                target: 'FETCHING_DATA',
                actions: 'storeWorkingFileIdFromOrphan',
              },
              CREATE_NEW_COPY: 'DELETING_ORPHAN',
            },
          },
          DELETING_ORPHAN: {
            on: {
              ORPHAN_DELETED: 'COPYING_FILE',
              DELETE_FAILED: {
                target: 'COLLISION_PROMPT',
                actions: 'showDeleteError',
              },
            },
          },
          COPYING_FILE: {
            on: {
              COPY_SUCCESS: {
                target: 'FETCHING_DATA',
                actions: 'storeWorkingFileId',
              },
              COPY_FAILED: {
                target: 'AWAITING_SELECTION',
                actions: 'showCopyError',
              },
            },
          },
          FETCHING_DATA: {
            on: {
              HYDRATION_COMPLETE: '#checkInApp.ATTENDANCE_PHASE',
              FETCH_FAILED: {
                target: 'AWAITING_SELECTION',
                actions: 'showFetchError',
              },
            },
          },
        },
      },

      ATTENDANCE_PHASE: {
        type: 'parallel',
        states: {
          appFlow: {
            initial: 'READY_EMPTY',
            states: {
              READY_EMPTY: {
                entry: assign({ toastPending: false, syncError: null, reauthError: null }),
                on: {
                  SEARCH_RESULTS_MULTIPLE: 'MULTI_MATCH',
                  SEARCH_RESULT_SINGLE: {
                    target: 'CONFIRMED_MATCH',
                    actions: 'setSelectedVisitor',
                  },
                  BARCODE_RESULT: {
                    target: 'CONFIRMED_MATCH',
                    actions: 'setSelectedVisitorFromBarcode',
                  },
                },
              },
              MULTI_MATCH: {
                on: {
                  VISITOR_SELECTED: {
                    target: 'CONFIRMED_MATCH',
                    actions: 'setSelectedVisitor',
                  },
                  SEARCH_CLEARED: {
                    target: 'READY_EMPTY',
                    actions: 'clearSearch',
                  },
                  SEARCH_RESULTS_MULTIPLE: 'MULTI_MATCH',
                  SEARCH_RESULT_SINGLE: {
                    target: 'CONFIRMED_MATCH',
                    actions: 'setSelectedVisitor',
                  },
                  SEARCH_NO_RESULTS: {
                    target: 'READY_EMPTY',
                    actions: 'showNoResults',
                  },
                },
              },
              CONFIRMED_MATCH: {
                on: {
                  ATTENDANCE_RECORDED: {
                    target: 'READY_EMPTY',
                    actions: [
                      'writeAttendanceToIDB',
                      'resetSearchAndSelection',
                      'scheduleToast',
                      'scheduleChirp',
                    ],
                  },
                  UNDO_ATTENDANCE: {
                    target: 'CONFIRMED_MATCH',
                    actions: 'clearAttendanceRecord',
                  },
                  BACK: {
                    target: 'READY_EMPTY',
                    actions: 'resetSearchAndSelection',
                  },
                  // Typing a new search while a card is showing replaces it inline
                  SEARCH_RESULTS_MULTIPLE: {
                    target: 'MULTI_MATCH',
                    actions: 'clearSearch',
                  },
                  SEARCH_RESULT_SINGLE: {
                    target: 'CONFIRMED_MATCH',
                    actions: 'setSelectedVisitor',
                  },
                  SEARCH_CLEARED: {
                    target: 'READY_EMPTY',
                    actions: 'resetSearchAndSelection',
                  },
                  SEARCH_NO_RESULTS: {
                    target: 'READY_EMPTY',
                    actions: 'resetSearchAndSelection',
                  },
                },
              },
            },
          },

          scanner: {
            initial: 'IDLE',
            states: {
              IDLE: {
                on: {
                  CANDIDATE_DETECTED: {
                    target: 'CANDIDATE_DETECTED',
                    actions: assign({ scanCandidate: ({ event }) => event.value }),
                  },
                  CAMERA_PERMISSION_DENIED: 'CAMERA_DENIED',
                  BARCODE_DETECTOR_UNAVAILABLE: 'FALLBACK_ACTIVE',
                },
              },
              CANDIDATE_DETECTED: {
                after: {
                  800: {
                    target: 'SCAN_SUCCESS',
                    guard: 'candidateStillLocked',
                  },
                },
                on: {
                  CANDIDATE_LOST: {
                    target: 'IDLE',
                    actions: assign({ scanCandidate: null }),
                  },
                  SCAN_AMBIGUOUS: {
                    target: 'SCAN_ERROR',
                    actions: assign({ scanCandidate: null }),
                  },
                },
              },
              SCAN_SUCCESS: {
                entry: ['dispatchBarcodeResult', 'flashGreen', 'playChirp', 'triggerHaptic'],
                after: { 600: 'IDLE' },
              },
              SCAN_ERROR: {
                entry: 'flashAmber',
                after: { 2000: 'IDLE' },
              },
              CAMERA_DENIED: {
                on: {
                  RETRY_CAMERA: 'IDLE',
                },
              },
              FALLBACK_ACTIVE: {
                on: {
                  CANDIDATE_DETECTED: {
                    target: 'CANDIDATE_DETECTED',
                    actions: assign({ scanCandidate: ({ event }) => event.value }),
                  },
                  CAMERA_PERMISSION_DENIED: 'CAMERA_DENIED',
                },
              },
            },
          },
        },

        on: {
          SYNC_INITIATED: '#checkInApp.SYNCING',
          RESET_INITIATED: [
            { guard: 'hasPendingAttendance', target: '#checkInApp.RESET_WARNING', actions: 'storePendingCount' },
            { guard: 'noPendingAttendance',  target: '#checkInApp.RESETTING' },
          ],
        },
      },

      RESET_WARNING: {
        on: {
          RESET_CONFIRMED: '#checkInApp.RESETTING',
          RESET_CANCELLED: '#checkInApp.ATTENDANCE_PHASE',
        },
      },

      RESETTING: {
        on: {
          RESET_COMPLETE: '#checkInApp.FILE_PICKER_PENDING',
        },
      },

      SYNC_SUCCESS: {
        on: {
          SYNC_ACKNOWLEDGED: '#checkInApp.AUTH_PENDING',
        },
      },

      SYNCING: {
        initial: 'CHECKING_TOKEN',
        states: {
          CHECKING_TOKEN: {
            on: {
              TOKEN_VALID:   'PUSHING_DATA',
              TOKEN_EXPIRED: 'REAUTHING',
            },
          },
          REAUTHING: {
            on: {
              AUTH_SUCCESS: {
                target: 'PUSHING_DATA',
                actions: 'updateStoredToken',
              },
              AUTH_FAILED: {
                target: '#checkInApp.ATTENDANCE_PHASE',
                actions: 'showReauthError',
              },
            },
          },
          PUSHING_DATA: {
            on: {
              PUSH_SUCCESS: {
                target: 'PURGING_STORES',
                actions: 'storeSyncedCount',
              },
              PUSH_FAILED: {
                target: '#checkInApp.ATTENDANCE_PHASE',
                actions: 'showSyncError',
              },
            },
          },
          PURGING_STORES: {
            on: {
              PURGE_COMPLETE: '#checkInApp.SYNC_SUCCESS',
            },
          },
        },
      },
    },
  },
  {
    guards: {
      visitorStoreEmpty:    ({ event }) => (event.visitorCount ?? 0) === 0,
      visitorStoreHydrated: ({ event }) => (event.visitorCount ?? 0) > 0,
      candidateStillLocked: ({ context }) => context.scanCandidate !== null,
      hasPendingAttendance: ({ event }) => (event.pendingCount ?? 0) > 0,
      noPendingAttendance:  ({ event }) => (event.pendingCount ?? 0) === 0,
    },
    actions: {
      storeMasterFileId: assign(({ event }) => ({
        masterFileId:   event.masterFileId,
        masterFileName: event.masterFileName,
        setupError:     null,
      })),
      storeOrphanFileId: assign(({ event }) => ({
        orphanFileId: event.orphanFileId,
      })),
      storeWorkingFileIdFromOrphan: ({ context }) => {
        // IDB write is fire-and-forget; context.orphanFileId is the workingFileId
        visitorService.writeSession({ workingFileId: context.orphanFileId }).catch(console.error);
      },
      storeWorkingFileId: ({ event }) => {
        visitorService.writeSession({ workingFileId: event.workingFileId }).catch(console.error);
      },
      showCollisionCheckError: assign({
        setupError: 'No se pudo verificar archivos existentes. Compruebe su conexión e intente de nuevo.',
      }),
      showDeleteError: assign({
        setupError: 'No se pudo eliminar el archivo anterior. Intente de nuevo o use el archivo existente.',
      }),
      showCopyError: assign({
        setupError: 'No se pudo copiar el archivo. Verifique permisos e intente de nuevo.',
      }),
      showFetchError: assign({
        setupError: 'No se pudo leer el archivo. Verifique permisos e intente de nuevo.',
      }),
      setSelectedVisitor:          assign({ selectedVisitor: ({ event }) => event.visitor }),
      setSelectedVisitorFromBarcode: assign({ selectedVisitor: ({ event }) => event.visitor }),
      clearSearch:                 assign({ selectedVisitor: null }),
      showNoResults:               assign({ selectedVisitor: null }),
      writeAttendanceToIDB:        () => {},  // component writes before dispatching event
      resetSearchAndSelection:     assign({ selectedVisitor: null }),
      scheduleToast:               assign({ toastPending: true }),
      scheduleChirp:               () => {},  // Zone1Scanner handles chirp on SCAN_SUCCESS entry
      clearAttendanceRecord:       assign({ selectedVisitor: ({ event }) => event.visitor }),
      dispatchBarcodeResult:       () => {},  // Zone1Scanner useEffect dispatches BARCODE_RESULT
      flashGreen:                  () => {},  // Zone1Scanner derives flash from scanner sub-state
      playChirp:                   () => {},  // Zone1Scanner plays chirp on SCAN_SUCCESS entry
      triggerHaptic: () => {
        if ('vibrate' in navigator) navigator.vibrate(50);
      },
      flashAmber: () => {},  // Zone1Scanner derives flash from scanner sub-state
      updateStoredToken: ({ event }) => {
        visitorService.writeSession({
          accessToken:   event.accessToken,
          tokenIssuedAt: event.tokenIssuedAt,
          ...(event.refreshToken !== undefined && { refreshToken: event.refreshToken }),
        }).catch(console.error);
      },
      showReauthError: assign({
        reauthError: ({ event }) =>
          event.message ?? 'La sesión no pudo renovarse. Reconecte e intente sincronizar de nuevo.',
        syncError: null,
      }),
      showSyncError: assign({
        syncError: ({ event }) =>
          event.message ?? 'Error al sincronizar. Intente de nuevo más tarde.',
        reauthError: null,
      }),
      setRetriggerPicker:   assign({ retriggerPicker: true }),
      clearRetriggerPicker: assign({ retriggerPicker: false }),
      openPickerIfRetrigger: () => {}, // App.jsx reads context.retriggerPicker and calls openGooglePicker
      storePendingCount: assign({ pendingAttendanceCount: ({ event }) => event.pendingCount ?? 0 }),
      storeSyncedCount:  assign({ syncedCount: ({ event }) => event.syncedCount ?? 0 }),
    },
  }
);
