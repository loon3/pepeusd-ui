import React from 'react';

const Spinner = () => {
  return (
    <div className="flex justify-center items-center mt-4">
      <div className="animate-spin inline-block w-8 h-8 border-4 border-white border-t-transparent rounded-full" role="status" aria-label="Loading"></div>
    </div>
  );
};

export default Spinner; 