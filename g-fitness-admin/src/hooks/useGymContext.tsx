import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { Gym } from '../types';
import { GYMS } from '../data/gyms';

interface GymContextType {
  selectedGym: Gym;
  setSelectedGym: (gym: Gym) => void;
  gyms: Gym[];
}

const GymContext = createContext<GymContextType | undefined>(undefined);

export function GymProvider({ children }: { children: ReactNode }) {
  const [selectedGym, setSelectedGym] = useState<Gym>(GYMS[0]);

  return (
    <GymContext.Provider value={{ selectedGym, setSelectedGym, gyms: GYMS }}>
      {children}
    </GymContext.Provider>
  );
}

export function useGymContext() {
  const context = useContext(GymContext);
  if (!context) {
    throw new Error('useGymContext must be used within GymProvider');
  }
  return context;
}
