# Dokumentacja Claude Code - Live Sales

Ten folder zawiera dokumentację i kontekst do pracy z Claude Code.

## Struktura

| Plik | Opis | Kiedy czytać |
|------|------|--------------|
| **CONTEXT.md** | Kontekst projektu - stack, struktura, konwencje | **ZAWSZE NA POCZĄTKU SESJI** |
| **TASKS.md** | Szczegółowy task list z checklistami | Podczas implementacji |
| **PLAN.md** | Pełny plan z kodem i analizą security | Jako referencja |

## Jak używać

### Nowa sesja Claude Code

1. **Wczytaj kontekst:**
   ```
   Przeczytaj .claude-docs/CONTEXT.md i .claude-docs/TASKS.md
   ```

2. **Kontynuuj implementację:**
   ```
   Kontynuuj implementację od miejsca gdzie skończyliśmy.
   Sprawdź TASKS.md żeby zobaczyć co jest zrobione.
   ```

### Podczas pracy

- Aktualizuj checklisty w TASKS.md po każdym ukończonym zadaniu
- Aktualizuj CONTEXT.md gdy zmieni się struktura/decyzje
- Dodawaj notatki do sekcji CHANGELOG w CONTEXT.md

### Po zakończeniu sesji

1. Zaktualizuj TASKS.md - zaznacz ukończone taski
2. Zaktualizuj CONTEXT.md - dodaj do CHANGELOG

## Quick Start

```
Przeczytaj .claude-docs/CONTEXT.md i rozpocznij implementację
od pierwszego niezaznaczonego zadania w .claude-docs/TASKS.md
```

## Status projektu

**Aktualnie:** Frontend Hardening + Security (v2)
**Faza:** Nie rozpoczęto
**Blocker:** Brak (można zaczynać)
