'use client';

import { useEffect, useState } from 'react';

/** Returns the current shift ('DIA' 07:30–19:30 / 'NOCHE' otherwise). */
export function getTurnoActual(): string {
  const m = new Date().getHours() * 60 + new Date().getMinutes();
  return m >= 450 && m < 1170 ? 'DIA' : 'NOCHE';
}

/** Returns the shift date (ISO yyyy-mm-dd); before 07:30 it belongs to the previous day. */
export function getFechaTurno(): string {
  const now = new Date();
  const m = now.getHours() * 60 + now.getMinutes();
  if (m < 450) {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return y.toISOString().split('T')[0];
  }
  return now.toISOString().split('T')[0];
}

/**
 * Reactive shift state. Recomputes `turnoActual`/`fechaTurno` every 60s so the
 * header label stays in sync without touching the scanner/WebSocket logic.
 */
export function useTurno() {
  const [turnoActual, setTurnoActual] = useState(getTurnoActual);
  const [fechaTurno, setFechaTurno] = useState(getFechaTurno);

  useEffect(() => {
    const i = setInterval(() => {
      setTurnoActual(getTurnoActual());
      setFechaTurno(getFechaTurno());
    }, 60_000);
    return () => clearInterval(i);
  }, []);

  return { turnoActual, fechaTurno };
}
