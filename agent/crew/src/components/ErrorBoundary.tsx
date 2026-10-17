import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

type Props = { children: ReactNode }

type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('CrewPay UI error', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-shell page-error-boundary">
          <section className="section">
            <h1 className="section-title">Something went wrong</h1>
            <p className="section-sub">
              This page hit an unexpected error. Try refreshing — if you just deployed, a one-time reload
              usually fixes stale assets.
            </p>
            <div className="btn-row">
              <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
                Reload
              </button>
              <Link className="btn btn-ghost" to="/">Home</Link>
            </div>
          </section>
        </div>
      )
    }
    return this.props.children
  }
}
