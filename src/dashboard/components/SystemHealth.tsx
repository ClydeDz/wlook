import { h } from 'preact'
import type { DashboardStatus } from '../../shared/ipc-contracts'

interface Props {
  status: DashboardStatus
}

type DotColor = 'green' | 'amber' | 'red'

function Indicator({ color, label, note }: { color: DotColor; label: string; note?: string }) {
  return (
    <li class="health-item">
      <span class={`health-dot health-dot--${color}`} aria-label={color} />
      <span class="health-label">{label}</span>
      {note && <span class="health-note">{note}</span>}
    </li>
  )
}

function hotkeyColor(status: DashboardStatus): DotColor {
  return status.hotkeyRegistered ? 'green' : 'amber'
}

function hotkeyLabel(status: DashboardStatus): string {
  return `Global hotkey: ${status.hotkeyAccelerator || 'Ctrl+Shift+D'}`
}

function hotkeyNote(status: DashboardStatus): string | undefined {
  if (!status.hotkeyRegistered) return 'Not registered — another app may be using this combination'
  return undefined
}

function captureColor(method: DashboardStatus['selectionCaptureMethod']): DotColor {
  if (method === 'uia') return 'green'
  if (method === 'clipboard') return 'amber'
  return 'red'
}

function captureLabel(method: DashboardStatus['selectionCaptureMethod']): string {
  if (method === 'uia') return 'Selection capture: UI Automation'
  if (method === 'clipboard') return 'Selection capture: Clipboard fallback'
  return 'Selection capture: Unavailable'
}

function captureNote(method: DashboardStatus['selectionCaptureMethod']): string | undefined {
  if (method === 'clipboard') return 'Enable in Settings for apps without UIA support'
  if (method === 'unavailable') return 'Could not read text selection'
  return undefined
}

export function SystemHealth({ status }: Props) {
  return (
    <section class="section">
      <h2 class="section__heading">System Health</h2>
      <div class="section__body">
        <ul class="health-list">
          <Indicator color="green" label="Background agent" />
          <Indicator
            color={hotkeyColor(status)}
            label={hotkeyLabel(status)}
            note={hotkeyNote(status)}
          />
          <Indicator
            color={captureColor(status.selectionCaptureMethod)}
            label={captureLabel(status.selectionCaptureMethod)}
            note={captureNote(status.selectionCaptureMethod)}
          />
        </ul>
      </div>
    </section>
  )
}
