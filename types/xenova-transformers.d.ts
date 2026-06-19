declare module "@xenova/transformers" {
  export type Pipeline = (text: string, options?: Record<string, unknown>) => Promise<{ data?: Float32Array; length?: number }>;
  export const env: {
    allowLocalModels: boolean;
    useBrowserCache: boolean;
  };
  export function pipeline(task: string, modelName: string): Promise<Pipeline>;
}
