import Icon from './Icon'

export default function QtyStepper({ value, onChange, min = 0, label, size }) {
  const iconSize = size === 'lg' ? 14 : 12

  return (
    <span className={size === 'lg' ? 'qty qty--lg' : 'qty'}>
      <button
        type="button"
        className="qty__btn"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={label ? `Remove one ${label}` : 'Decrease quantity'}
      >
        <Icon name="minus" size={iconSize} />
      </button>
      <span className="qty__value" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className="qty__btn"
        onClick={() => onChange(value + 1)}
        aria-label={label ? `Add one ${label}` : 'Increase quantity'}
      >
        <Icon name="plus" size={iconSize} />
      </button>
    </span>
  )
}
