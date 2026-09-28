import * as React from 'react'

interface Props {
  children: React.ReactNode
  onReset?: () => void
  fallbackTitle?: string
}

interface State {
  hasError: boolean
  error: Error | null
}

export class PlayerErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('PlayerErrorBoundary caught error:', error)
    console.error('Component stack:', info.componentStack)
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
    this.props.onReset?.()
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      const message = this.state.error?.message ?? 'Unknown error'
      const truncatedMessage = message.length > 200 ? message.slice(0, 200) + '...' : message
      const title = this.props.fallbackTitle ?? 'Something went wrong'

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '300px',
            padding: '24px',
            backgroundColor: '#1a1a2e',
            color: '#ffffff',
            borderRadius: '8px',
            textAlign: 'center',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          <h2 style={{ margin: '0 0 12px', fontSize: '1.25rem', fontWeight: 600 }}>
            {title}
          </h2>
          <p style={{ margin: '0 0 24px', fontSize: '0.875rem', color: '#a0a0a0', maxWidth: '400px' }}>
            {truncatedMessage}
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              padding: '10px 24px',
              fontSize: '0.875rem',
              fontWeight: 500,
              color: '#ffffff',
              backgroundColor: '#3b82f6',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              transition: 'background-color 0.2s',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#2563eb'
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#3b82f6'
            }}
          >
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}