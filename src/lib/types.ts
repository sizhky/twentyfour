export type Mode = 'plan' | 'retrospect';

export type DayRef = {
  isoDate: string;
  timezone: string;
};

export type TimeSlot = {
  id: string;
  groupId?: string;
  startMinute: number;
  endMinute: number;
  label: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type DayTimeline = {
  mode: Mode;
  day: DayRef;
  slots: TimeSlot[];
  updatedAt: string;
  schemaVersion: number;
};

export type DraftRange = {
  startMinute: number;
  endMinute: number;
};
