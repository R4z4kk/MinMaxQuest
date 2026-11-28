import { parse } from "luaparse";


// Lua 5.1 (WoW) refuses to load a chunk past these: lparser.c LUAI_MAXUPVALUES and LUAI_MAXVARS.
export const LUA51_MAX_UPVALUES = 60;
export const LUA51_MAX_LOCALS = 200;
// lcode.c addk: "constant table overflow" past MAXARG_Bx.
export const LUA51_MAX_CONSTANTS = 262143;

export interface FunctionLimits {
  line: number;
  upvalues: number;
  locals: number;
  constants: number;
}

interface Variable {
  fn: FnState;
}

interface FnState {
  line: number;
  parent: FnState | null;
  upvalues: Set<Variable>;
  constants: Set<string>;
  active: number;
  maxActive: number;
}

type Node = { type: string; [key: string]: unknown };

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";

export function luaFunctionLimits(source: string): FunctionLimits[] {
  const ast = parse(source, { luaVersion: "5.1", locations: true, comments: false }) as unknown as Node;
  const results: FunctionLimits[] = [];
  const scopes: Map<string, Variable>[] = [];
  let current: FnState = { line: 0, parent: null, upvalues: new Set(), constants: new Set(), active: 0, maxActive: 0 };

  const declare = (name: string): void => {
    scopes[scopes.length - 1].set(name, { fn: current });
    current.active++;
    if (current.active > current.maxActive) current.maxActive = current.active;
  };

  const reference = (name: string): void => {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const variable = scopes[i].get(name);
      if (variable == null) continue;
      for (let fn: FnState | null = current; fn != null && fn !== variable.fn; fn = fn.parent) fn.upvalues.add(variable);
      return;
    }
    current.constants.add(`s:${name}`);
  };

  const block = (body: unknown, before: () => void = () => {}): void => {
    scopes.push(new Map());
    const activeBefore = current.active;
    before();
    for (const statement of body as Node[]) visit(statement);
    current.active = activeBefore;
    scopes.pop();
  };

  const fn = (node: Node, self: boolean): void => {
    const line = (node.loc as { start: { line: number } }).start.line;
    const parent = current;
    current = { line, parent, upvalues: new Set(), constants: new Set(), active: 0, maxActive: 0 };
    block(node.body, () => {
      if (self) declare("self");
      for (const param of node.parameters as Node[]) if (param.type === "Identifier") declare(param.name as string);
    });
    results.push({ line, upvalues: current.upvalues.size, locals: current.maxActive, constants: current.constants.size });
    current = parent;
  };

  const visitAll = (value: unknown): void => {
    if (Array.isArray(value)) for (const item of value) visitAll(item);
    else if (isNode(value)) visit(value);
  };

  function visit(node: Node): void {
    switch (node.type) {
      case "Identifier":
        reference(node.name as string);
        return;
      case "MemberExpression":
        if (node.indexer === "." && isNode(node.identifier)) current.constants.add(`s:${node.identifier.name as string}`);
        visitAll(node.base);
        return;
      case "TableKeyString":
        if (isNode(node.key)) current.constants.add(`s:${node.key.name as string}`);
        visitAll(node.value);
        return;
      case "NumericLiteral":
        current.constants.add(`n:${node.value as number}`);
        return;
      case "StringLiteral":
        current.constants.add(`s:${(node.raw as string).slice(1, -1)}`);
        return;
      case "LocalStatement":
        visitAll(node.init);
        for (const variable of node.variables as Node[]) declare(variable.name as string);
        return;
      case "FunctionDeclaration": {
        const id = node.identifier;
        if (node.isLocal === true && isNode(id)) {
          declare(id.name as string);
          fn(node, false);
          return;
        }
        if (isNode(id)) visitAll(id.type === "MemberExpression" ? id.base : id);
        fn(node, isNode(id) && id.type === "MemberExpression" && id.indexer === ":");
        return;
      }
      case "DoStatement":
      case "WhileStatement":
        visitAll(node.condition);
        block(node.body);
        return;
      case "RepeatStatement": {
        scopes.push(new Map());
        const activeBefore = current.active;
        for (const statement of node.body as Node[]) visit(statement);
        visitAll(node.condition);
        current.active = activeBefore;
        scopes.pop();
        return;
      }
      case "IfStatement":
        for (const clause of node.clauses as Node[]) {
          visitAll(clause.condition);
          block(clause.body);
        }
        return;
      case "ForNumericStatement":
        visitAll([node.start, node.end, node.step]);
        block(node.body, () => declare((node.variable as Node).name as string));
        return;
      case "ForGenericStatement":
        visitAll(node.iterators);
        block(node.body, () => {
          for (const variable of node.variables as Node[]) declare(variable.name as string);
        });
        return;
      default:
        for (const [key, value] of Object.entries(node)) if (key !== "loc" && key !== "range") visitAll(value);
    }
  }

  block((ast as { body: unknown }).body);
  results.push({ line: 0, upvalues: 0, locals: current.maxActive, constants: current.constants.size });
  return results;
}
