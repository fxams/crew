import { Link } from 'react-router-dom'
import { humanizeRegisterError } from '../lib/register-pending'

type Props = {
  message: string
  actionLabel: string
  onAction?: () => void
  to?: string
  testId?: string
}

/** Error copy plus a single recovery action — never leave a failed step without a next tap. */
export function RegisterRecovery({
  message,
  actionLabel,
  onAction,
  to,
  testId = 'register-recovery',
}: Props) {
  const text = humanizeRegisterError(message) || message
  if (!text) return null
  return (
    <div className="register-recovery" data-testid={testId} role="alert">
      <p className="register-err">{text}</p>
      {to ? (
        <Link className="btn btn-primary btn-sm" to={to} data-testid={`${testId}-action`}>
          {actionLabel}
        </Link>
      ) : (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={onAction}
          data-testid={`${testId}-action`}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
