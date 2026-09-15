/** Rule 2-1-3: additional names apply everywhere, including deck construction. */
export function cardNameAliases(schema: unknown): string[] {
  if (!schema || typeof schema !== "object") return [];
  const value = schema as Record<string, unknown>;
  const rules: unknown[] = Array.isArray(value.rule_modifications)
    ? [...value.rule_modifications]
    : [];
  if (Array.isArray(value.effects)) {
    for (const effect of value.effects) {
      if (
        effect &&
        typeof effect === "object" &&
        effect.category === "rule_modification"
      ) {
        rules.push(effect.rule);
      }
    }
  }
  return [
    ...new Set(
      rules.flatMap((rule) => {
        if (!rule || typeof rule !== "object") return [];
        const mod = rule as Record<string, unknown>;
        return mod.rule_type === "NAME_ALIAS" && Array.isArray(mod.aliases)
          ? mod.aliases.filter(
              (alias): alias is string => typeof alias === "string"
            )
          : [];
      })
    ),
  ];
}

export interface CardNames {
  name: string;
  nameAliases?: readonly string[];
  treatsAsAllNames: boolean;
}

export function cardHasName(card: CardNames, name: string): boolean {
  return (
    card.treatsAsAllNames ||
    card.name === name ||
    Boolean(card.nameAliases?.includes(name))
  );
}

export function cardsShareName(card: CardNames, other: CardNames): boolean {
  return (
    card.treatsAsAllNames ||
    other.treatsAsAllNames ||
    [other.name, ...(other.nameAliases ?? [])].some((name) =>
      cardHasName(card, name)
    )
  );
}
