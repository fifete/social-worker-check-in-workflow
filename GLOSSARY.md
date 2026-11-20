# Social Worker Check-In

Vocabulary for the visitor check-in workflow that social workers run at in-person events, recording who attended against a pre-registered list of visitors.

## Language

### People

**Worker**:
The social worker who operates the app at an event and checks visitors in.
_Avoid_: User, operator, staff

**Visitor**:
A pre-registered person expected to attend an event, listed as one row of the master file.
_Avoid_: Attendee, guest, family member

**Host**:
The adolescent a visitor is coming to see, identified on the visitor's row.
_Avoid_: Adolescent, resident, patient

### Records and files

**Master file**:
The original event spreadsheet in Google Drive listing every visitor and host. It is never modified.
_Avoid_: Source sheet, template, original

**Working copy**:
The duplicate of the master file, named `{name}_ASISTENCIA`, that the app reads from and writes attendance back to.
_Avoid_: Clone, backup, `_ASISTENCIA` file

**Attendance record**:
The statement that a particular visitor arrived at the event, with the time it was registered. It can be undone by the worker before sync.
_Avoid_: Attendance entry, registration, scan

**Pending sync record**:
An attendance record that has been registered on the device but not yet written to the working copy.
_Avoid_: Unsynced record, dirty record, queued record

**Failed record**:
A visitor whose attendance record could not be registered on the device or written to the working copy.
_Avoid_: Lost record, bad row, error row

**Log entry**:
A note the app keeps about something that went wrong, so that the developers can see it later. It is kept on the device until its receipt has been confirmed.
_Avoid_: Error report, event, log line

### Phases

**Setup**:
The online phase, once per event, where the worker signs in, picks the master file, and the app creates the working copy and loads its visitors onto the device.
_Avoid_: Phase 1, onboarding, initialization

**Attendance**:
The offline-first phase that lasts for the event, where the worker finds each arriving visitor and registers their attendance record.
_Avoid_: Phase 2, check-in mode, event mode

**Sync**:
The online phase at the end of the event where all pending sync records are written to the working copy and the device is cleared for the next event.
_Avoid_: Phase 3, upload, export, reset
