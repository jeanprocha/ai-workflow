/**
 * Avaliador seguro de expressoes aritmeticas (sem eval()).
 * Suporta: + - * / ( ) numeros decimais e negativos.
 */
export function evaluateMathExpression(expression: string): number {
  const tokens = tokenize(expression);
  let pos = 0;

  function peek() {
    return tokens[pos];
  }
  function next() {
    return tokens[pos++];
  }

  function parseExpression(): number {
    let value = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseFactor();
    while (peek() === '*' || peek() === '/') {
      const op = next();
      const rhs = parseFactor();
      value = op === '*' ? value * rhs : value / rhs;
    }
    return value;
  }

  function parseFactor(): number {
    if (peek() === '-') {
      next();
      return -parseFactor();
    }
    if (peek() === '(') {
      next();
      const value = parseExpression();
      if (peek() !== ')') throw new Error('Parenteses desbalanceados.');
      next();
      return value;
    }
    const token = next();
    const value = Number(token);
    if (token === undefined || Number.isNaN(value)) {
      throw new Error(`Token invalido na expressao: "${token}".`);
    }
    return value;
  }

  const result = parseExpression();
  if (pos !== tokens.length) {
    throw new Error('Expressao invalida — sobrou conteudo apos o parse.');
  }
  return result;
}

function tokenize(expression: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < expression.length) {
    const char = expression[i];
    if (char === ' ' || char === '\t') {
      i++;
      continue;
    }
    if ('+-*/()'.includes(char)) {
      tokens.push(char);
      i++;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      let num = '';
      while (i < expression.length && /[0-9.]/.test(expression[i])) {
        num += expression[i];
        i++;
      }
      tokens.push(num);
      continue;
    }
    throw new Error(`Caractere invalido na expressao: "${char}".`);
  }
  return tokens;
}
