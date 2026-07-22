const SECRET_PATTERN = /\b(?:pn|sk|cr|ak|key|token)_[A-Za-z0-9_-]{12,}\b|\b[A-Za-z0-9_-]{24,}\b/g;

export interface RedactedInput {
  text: string;
  secrets: Record<string, string>;
}

export function redactCommandSecrets(input: string): RedactedInput {
  const secrets: Record<string, string> = {};
  let index = 0;
  const text = input.replace(SECRET_PATTERN, (match) => {
    if (match.length < 24 && !/^(pn|sk|cr|ak|key|token)_/i.test(match)) return match;
    index += 1;
    const ref = `__SECRET_${index}__`;
    secrets[ref] = match;
    return ref;
  });
  return { text, secrets };
}

export function resolveSecretRef(secrets: Record<string, string>, ref?: string) {
  if (!ref) return '';
  return secrets[ref] || '';
}

