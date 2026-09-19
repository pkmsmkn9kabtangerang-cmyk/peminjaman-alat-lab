export default function Button({ children, variant = 'primary', onClick, type = 'button', className = '', disabled = false, icon: Icon }) {
  let baseStyles = 'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-1';
  let variantStyles = '';

  if (variant === 'primary') {
    variantStyles = 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500';
  } else if (variant === 'secondary') {
    variantStyles = 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 focus:ring-gray-400';
  } else if (variant === 'danger') {
    variantStyles = 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500';
  } else if (variant === 'success') {
    variantStyles = 'bg-green-600 hover:bg-green-700 text-white focus:ring-green-500';
  }

  if (disabled) {
    variantStyles = 'bg-gray-200 text-gray-400 border border-gray-200 cursor-not-allowed shadow-none';
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variantStyles} ${className}`}
    >
      {Icon && <Icon size={16} />}
      <span>{children}</span>
    </button>
  );
}
