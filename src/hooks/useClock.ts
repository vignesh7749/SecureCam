import { useState, useEffect } from 'react';

export function useClock() {
  const [time, setTime] = useState<Date>(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedLocal = time.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const formattedUtc = time.toISOString().substring(11, 19) + ' UTC';

  const formattedDate = time.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });

  return {
    time,
    formattedLocal,
    formattedUtc,
    formattedDate,
  };
}
