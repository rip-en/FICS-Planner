declare module "javascript-lp-solver" {
  interface Model {
    optimize: string;
    opType: "min" | "max";
    constraints: Record<string, { min?: number; max?: number; equal?: number }>;
    variables: Record<string, Record<string, number>>;
    ints?: Record<string, 1>;
  }

  interface Solution {
    feasible?: boolean;
    result?: number;
    bounded?: boolean;
    [variableOrResult: string]: number | boolean | undefined;
  }

  export function Solve(model: Model): Solution;
  const _default: { Solve: typeof Solve };
  export default _default;
}
