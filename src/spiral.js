import React from 'react';

const SpiralProgress = ({ progress }) => {
  const segments = 1000;
  const turns = 12;
  const size = 300;
  const center = size / 2;
  const maxRadius = center - 10;
  const barWidth = 12;

  const spiralPath = (index) => {
    const angle = (index / segments) * turns * 2 * Math.PI;
    const radius = (index / segments) * maxRadius;
    const x = center + radius * Math.cos(angle);
    const y = center + radius * Math.sin(angle);
    return index === 0 ? [center, center] : [x, y]; // Ensure the first point is at the center
  };

  const createSpiralPath = (points) => {
    return points.reduce((path, point, index) => {
      const [x, y] = point;
      return index === 0 ? `M ${x} ${y}` : `${path} L ${x} ${y}`;
    }, '');
  };

  const allPoints = Array.from({ length: segments }, (_, i) => spiralPath(i));
  const filledPathData = createSpiralPath(allPoints.slice(0, Math.floor((progress / 100) * segments)));
  const unfilledPathData = createSpiralPath(allPoints);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <path d={unfilledPathData} stroke="#e4e7d1" strokeWidth={barWidth} fill="none" strokeLinecap="butt" />
      <path d={filledPathData} stroke="#5e7757" strokeWidth={barWidth} fill="none" strokeLinecap="butt" />
      
      {progress > 0 ? (
        <circle cx={center} cy={center} r={barWidth / 2} fill="#5e7757" />
      ) : (
        <circle cx={center} cy={center} r={barWidth / 2} fill="#e4e7d1" />
      )}
    </svg>
  );
};

export default SpiralProgress;
