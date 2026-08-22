// Piaf — Le Studio's monochrome mascot. A little sparrow drawn in the same
// stroke language as the icon set (currentColor, round caps), so it inherits
// ink in both themes and never breaks the paper-and-ink look.
//
// Moods: 'sing' (default, notes), 'cheer' (wing up, sparks), 'rest' (closed
// eye, no notes), 'oops' (flat eyes, sweat drop). Decorative by default;
// pass role="img" + aria-label when it carries meaning on its own.

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

function Eye({ cx, cy, closed }) {
  return closed ? (
    <path d={`M ${cx - 1.4} ${cy} q 1.4 1.1 2.8 0`} {...STROKE} />
  ) : (
    <circle cx={cx} cy={cy} r="0.95" fill="currentColor" stroke="none" />
  );
}

export default function Mascot({ size = 48, mood = 'sing', className = '', ...rest }) {
  const singing = mood === 'sing';
  const cheering = mood === 'cheer';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden={!('aria-label' in rest || 'role' in rest) ? true : undefined}
      className={className}
      {...rest}
    >
      {/* crest */}
      <path d="M 8.5 3.9 Q 8.2 2.3 9.6 2" {...STROKE} />
      <path d="M 10.1 3.85 Q 11 3.1 10.5 2.1" {...STROKE} />

      {/* tail feathers — floated clear of the body */}
      <path d="M 5.8 10.4 L 2.4 8.2" {...STROKE} />
      <path d="M 5.6 12.4 L 2.2 11" {...STROKE} />

      {/* body */}
      <circle cx="12.4" cy="13.8" r="5.6" {...STROKE} />
      {/* head — kisses the body, no deep overlap */}
      <circle cx="8.8" cy="7.2" r="3.5" {...STROKE} />

      {/* beak */}
      <path d="M 12 6.2 L 15.2 7.1 L 12.1 8.4" {...STROKE} />

      {/* legs */}
      <path d="M 10.6 19.3 V 21.6" {...STROKE} />
      <path d="M 13.8 19.2 V 21.6" {...STROKE} />
      <path d="M 10.6 21.6 H 9.4" {...STROKE} />
      <path d="M 13.8 21.6 H 12.6" {...STROKE} />

      {/* wing: two soft feather-lines when folded, raised while cheering */}
      {cheering ? (
        <path d="M 10.8 12.6 C 13.6 9.8, 17.2 9.2, 19.8 11 C 17.8 14.4, 13.8 15.2, 11 13.6" {...STROKE} />
      ) : (
        <g>
          <path d="M 9 13.4 Q 11.4 11.6 13.8 12.6" {...STROKE} />
          <path d="M 8.9 15.3 Q 11.2 13.7 13.5 14.5" {...STROKE} />
        </g>
      )}

      <Eye cx={9.4} cy={6.3} closed={mood === 'rest' || mood === 'oops'} />

      {/* song notes */}
      {singing && (
        <g>
          <circle cx="18.6" cy="6.4" r="0.95" {...STROKE} />
          <path d="M 19.55 6.3 V 2.9" {...STROKE} />
          <path d="M 19.55 2.9 Q 21 3.3 20.8 4.8" {...STROKE} />
        </g>
      )}

      {/* celebration sparks */}
      {cheering && (
        <g>
          <path d="M 18.2 2.6 L 18.2 4.4" {...STROKE} />
          <path d="M 21.4 5.4 L 19.8 6.2" {...STROKE} />
          <path d="M 15.4 2.2 L 16.2 3.8" {...STROKE} />
        </g>
      )}

      {/* oops: single sweat drop, close to the head */}
      {mood === 'oops' && (
        <path d="M 14.2 3.4 Q 15.5 5.1 14.4 6.1 Q 13.3 5.1 14.2 3.4 Z" {...STROKE} />
      )}
    </svg>
  );
}
