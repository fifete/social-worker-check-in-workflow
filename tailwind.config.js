/** @type {import('tailwindcss').Config} */
// ⚠️ Tailwind v4 is installed. This file is loaded via @config in src/index.css for
//    backwards-compatibility. No hex values are hardcoded — all colors reference CSS vars.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        /* Backgrounds */
        'bg-page':    'var(--color-bg-page)',
        'bg-card':    'var(--color-bg-card)',
        'bg-input':   'var(--color-bg-input)',
        'bg-overlay': 'var(--color-bg-overlay)',

        /* Borders */
        'border-base':  'var(--color-border)',
        'border-focus': 'var(--color-border-focus)',

        /* Text */
        'text-primary':   'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-disabled':  'var(--color-text-disabled)',
        'text-inverse':   'var(--color-text-inverse)',

        /* Brand / Primary */
        'primary':        'var(--color-primary)',
        'primary-hover':  'var(--color-primary-hover)',
        'primary-active': 'var(--color-primary-active)',

        /* Success */
        'success':      'var(--color-success)',
        'success-hover':'var(--color-success-hover)',
        'success-bg':   'var(--color-success-bg)',
        'success-text': 'var(--color-success-text)',

        /* Warning */
        'warning':     'var(--color-warning)',
        'warning-bg':  'var(--color-warning-bg)',
        'warning-text':'var(--color-warning-text)',

        /* Danger */
        'danger':      'var(--color-danger)',
        'danger-hover':'var(--color-danger-hover)',
        'danger-bg':   'var(--color-danger-bg)',
        'danger-text': 'var(--color-danger-text)',

        /* Attended */
        'attended-bg':    'var(--color-attended-bg)',
        'attended-text':  'var(--color-attended-text)',
        'attended-border':'var(--color-attended-border)',

        /* Scanner frame */
        'scanner-idle':      'var(--color-scanner-idle)',
        'scanner-candidate': 'var(--color-scanner-candidate)',
        'scanner-success':   'var(--color-scanner-success)',
        'scanner-error':     'var(--color-scanner-error)',
      },
    },
  },
  plugins: [],
}
