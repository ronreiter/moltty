export class TerminalWebSocket {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null

  constructor(
    private url: string,
    private onData: (data: ArrayBuffer) => void,
    private onClose?: () => void,
    private onOpen?: () => void
  ) {}

  connect(): void {
    this.ws = new WebSocket(this.url)
    this.ws.binaryType = 'arraybuffer'

    this.ws.onopen = () => {
      this.reconnectAttempts = 0
      this.onOpen?.()
    }

    this.ws.onmessage = (event) => {
      this.onData(event.data)
    }

    this.ws.onclose = () => {
      this.tryReconnect()
    }

    this.ws.onerror = () => {
      this.ws?.close()
    }
  }

  send(data: string | ArrayBuffer): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(data)
    }
  }

  sendResize(cols: number, rows: number): void {
    this.send(JSON.stringify({ type: 'resize', cols, rows }))
  }

  private tryReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.onClose?.()
      return
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000)
    this.reconnectAttempts++

    this.reconnectTimeout = setTimeout(() => {
      this.connect()
    }, delay)
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }
    this.maxReconnectAttempts = 0
    this.ws?.close()
    this.ws = null
  }
}
