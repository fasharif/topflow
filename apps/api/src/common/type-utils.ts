/** Distributive-safe Omit that keeps literal keys. */
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
