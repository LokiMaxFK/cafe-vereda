import type { CafeTable } from "../domain/types";

export const initialTables: CafeTable[] = [
  { id: "t1", number: 1, seats: 2, shape: "round", x: 8, y: 14, active: true },
  { id: "t2", number: 2, seats: 4, shape: "square", x: 31, y: 12, active: true },
  { id: "t3", number: 3, seats: 4, shape: "square", x: 57, y: 12, active: true },
  { id: "t4", number: 4, seats: 6, shape: "rectangular", x: 78, y: 14, active: true },
  { id: "t5", number: 5, seats: 2, shape: "round", x: 12, y: 55, active: true },
  { id: "t6", number: 6, seats: 4, shape: "square", x: 38, y: 52, active: true },
  { id: "t7", number: 7, seats: 4, shape: "square", x: 65, y: 53, active: true },
  { id: "t8", number: 8, seats: 2, shape: "round", x: 88, y: 56, active: true }
];
