import {
  getPath,
  hasUnresolvedExpression,
  resolveExpressions,
  UnknownNodeIdError,
  type ExpressionContext,
} from "./expressions";

function ctx(overrides: Partial<ExpressionContext> = {}): ExpressionContext {
  return {
    input: {},
    vars: {},
    nodeOutputs: {},
    ...overrides,
  };
}

describe("getPath", () => {
  it("retorna a raiz para path vazio", () => {
    const root = { a: 1 };
    expect(getPath(root, "")).toBe(root);
  });

  it("navega por objetos aninhados", () => {
    expect(getPath({ a: { b: { c: 42 } } }, "a.b.c")).toBe(42);
  });

  it("navega por indices de array (mesma sintaxe de ponto)", () => {
    expect(getPath({ items: [{ nome: "x" }, { nome: "y" }] }, "items.0.nome")).toBe("x");
    expect(getPath({ items: [{ nome: "x" }, { nome: "y" }] }, "items.1.nome")).toBe("y");
  });

  it("retorna undefined ao atravessar null/undefined no meio do caminho", () => {
    expect(getPath({ a: null }, "a.b.c")).toBeUndefined();
    expect(getPath(undefined, "a.b")).toBeUndefined();
  });
});

describe("resolveExpressions — valor unico", () => {
  it("resolve {{ $input }} para o input inteiro", () => {
    const context = ctx({ input: { foo: "bar" } });
    expect(resolveExpressions("{{ $input }}", context)).toEqual({ foo: "bar" });
  });

  it("resolve {{ $input.a.b }}", () => {
    const context = ctx({ input: { a: { b: 10 } } });
    expect(resolveExpressions("{{ $input.a.b }}", context)).toBe(10);
  });

  it("resolve {{ $vars.KEY }}", () => {
    const context = ctx({ vars: { KEY: "valor" } });
    expect(resolveExpressions("{{ $vars.KEY }}", context)).toBe("valor");
  });

  it("resolve {{ $node.<id>.<path> }}", () => {
    const context = ctx({ nodeOutputs: { n1: { result: 99 } } });
    expect(resolveExpressions("{{ $node.n1.result }}", context)).toBe(99);
  });

  it("preserva o tipo original quando a string e so uma expressao (nao vira string)", () => {
    const context = ctx({ input: { n: 123, arr: [1, 2, 3], obj: { x: 1 } } });
    expect(resolveExpressions("{{ $input.n }}", context)).toBe(123);
    expect(resolveExpressions("{{ $input.arr }}", context)).toEqual([1, 2, 3]);
    expect(resolveExpressions("{{ $input.obj }}", context)).toEqual({ x: 1 });
  });
});

describe("resolveExpressions — interpolacao em template (multiplas expressoes ou texto ao redor)", () => {
  it("interpola string dentro de um texto maior", () => {
    const context = ctx({ vars: { nome: "Mundo" } });
    expect(resolveExpressions("Ola, {{ $vars.nome }}!", context)).toBe("Ola, Mundo!");
  });

  it("interpola varias expressoes na mesma string", () => {
    const context = ctx({ vars: { a: "A", b: "B" } });
    expect(resolveExpressions("{{ $vars.a }}-{{ $vars.b }}", context)).toBe("A-B");
  });

  it("serializa objeto/array como JSON quando interpolado em template (nao e valor unico)", () => {
    const context = ctx({ input: { obj: { x: 1 } } });
    expect(resolveExpressions("valor: {{ $input.obj }}", context)).toBe(
      'valor: {"x":1}',
    );
  });

  it("substitui undefined/null por string vazia na interpolacao", () => {
    const context = ctx({ vars: {} });
    expect(resolveExpressions("[{{ $vars.inexistente }}]", context)).toBe("[]");
  });
});

describe("resolveExpressions — recursao em arrays e objetos", () => {
  it("resolve expressoes dentro de arrays", () => {
    const context = ctx({ vars: { a: 1, b: 2 } });
    expect(
      resolveExpressions(["{{ $vars.a }}", "{{ $vars.b }}"], context),
    ).toEqual([1, 2]);
  });

  it("resolve expressoes dentro de objetos aninhados", () => {
    const context = ctx({ vars: { a: 1 } });
    expect(
      resolveExpressions({ chave: "{{ $vars.a }}", outra: { fixa: 1 } }, context),
    ).toEqual({ chave: 1, outra: { fixa: 1 } });
  });

  it("valores nao-string/objeto/array passam intocados", () => {
    const context = ctx();
    expect(resolveExpressions(42, context)).toBe(42);
    expect(resolveExpressions(true, context)).toBe(true);
    expect(resolveExpressions(null, context)).toBeNull();
  });
});

describe("preserveRoots", () => {
  it("mantem a expressao literal (nao resolve) quando a raiz esta em preserveRoots", () => {
    const context = ctx({
      extraRoots: { auth: { token: "nao-deveria-aparecer" } },
      preserveRoots: ["$auth"],
    });
    expect(resolveExpressions("{{ $auth.token }}", context)).toBe("{{ $auth.token }}");
  });

  it("resolve normalmente raizes que NAO estao em preserveRoots", () => {
    const context = ctx({
      vars: { x: 1 },
      extraRoots: { auth: { token: "secreto" } },
      preserveRoots: ["$auth"],
    });
    expect(resolveExpressions("{{ $vars.x }}", context)).toBe(1);
  });

  it("preserva dentro de interpolacao de template tambem", () => {
    const context = ctx({
      extraRoots: { auth: { token: "x" } },
      preserveRoots: ["$auth"],
    });
    expect(resolveExpressions("Bearer {{ $auth.token }}", context)).toBe(
      "Bearer {{ $auth.token }}",
    );
  });
});

describe("extraRoots", () => {
  it("resolve raiz extra registrada (valor unico e interpolado)", () => {
    const context = ctx({ extraRoots: { sig: { hash: "abc123" } } });
    expect(resolveExpressions("{{ $sig }}", context)).toEqual({ hash: "abc123" });
    expect(resolveExpressions("hash={{ $sig.hash }}", context)).toBe("hash=abc123");
  });
});

describe("knownNodeIds", () => {
  it("lanca UnknownNodeIdError para id de node que nao existe no grafo", () => {
    const context = ctx({ knownNodeIds: new Set(["n1", "n2"]) });
    expect(() => resolveExpressions("{{ $node.n3.x }}", context)).toThrow(
      UnknownNodeIdError,
    );
  });

  it("resolve para undefined (nao lanca) quando o id existe mas ainda nao executou", () => {
    const context = ctx({
      knownNodeIds: new Set(["n1", "n2"]),
      nodeOutputs: {},
    });
    expect(resolveExpressions("{{ $node.n2.x }}", context)).toBeUndefined();
  });

  it("sem knownNodeIds, qualquer id de node resolve pra undefined em vez de lancar", () => {
    const context = ctx({ nodeOutputs: {} });
    expect(resolveExpressions("{{ $node.qualquer.x }}", context)).toBeUndefined();
  });
});

describe("hasUnresolvedExpression", () => {
  it("detecta expressao nao resolvida numa string", () => {
    expect(hasUnresolvedExpression("ainda tem {{ $auth.x }} aqui")).toBe(
      "{{ $auth.x }}",
    );
  });

  it("retorna null quando nao ha expressao pendente", () => {
    expect(hasUnresolvedExpression("texto normal")).toBeNull();
  });

  it("procura recursivamente em arrays", () => {
    expect(hasUnresolvedExpression(["ok", "{{ $x }}"])).toBe("{{ $x }}");
  });

  it("procura recursivamente em objetos", () => {
    expect(hasUnresolvedExpression({ a: "ok", b: { c: "{{ $x }}" } })).toBe(
      "{{ $x }}",
    );
  });

  it("retorna null pra valores nao-string/array/objeto", () => {
    expect(hasUnresolvedExpression(42)).toBeNull();
    expect(hasUnresolvedExpression(null)).toBeNull();
  });
});
