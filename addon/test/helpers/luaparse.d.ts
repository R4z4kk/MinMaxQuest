declare module "luaparse" {
  export function parse(source: string, options: { luaVersion: string; locations: boolean; comments: boolean }): unknown;
}
