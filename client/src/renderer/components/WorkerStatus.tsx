import React, { useEffect, useState } from 'react'
import { useStore } from '../store'

export default function WorkerStatus() {
  const { workerConnected, setWorkerConnected } = useStore()
  const [workerName, setWorkerName] = useState('Worker')

  useEffect(() => {
    // Fetch initial status
    window.electronAPI.getWorkerStatus().then((status) => {
      setWorkerConnected(status.isConnected)
      setWorkerName(status.workerName)
    })

    // Listen for status changes
    window.electronAPI.onWorkerStatusChange((status) => {
      setWorkerConnected(status.isConnected)
    })
  }, [setWorkerConnected])

  return (
    <div className="px-3 pb-2 flex items-center gap-2">
      <div
        className={`w-2 h-2 rounded-full flex-shrink-0 ${
          workerConnected ? 'bg-terminal-green' : 'bg-terminal-subtext'
        }`}
      />
      <span className="text-xs text-terminal-subtext truncate">
        {workerName} {workerConnected ? '' : '(offline)'}
      </span>
    </div>
  )
}
