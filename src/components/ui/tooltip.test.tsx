// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { Tooltip, TooltipProvider } from "./tooltip"

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
})

afterEach(cleanup)

describe("Tooltip", () => {
  it("renders interactive children bare when content is undefined", async () => {
    const user = userEvent.setup()
    const onClick = vi.fn()

    render(
      <Tooltip content={undefined} delayDuration={0}>
        <button type="button" onClick={onClick}>
          Join lobby
        </button>
      </Tooltip>
    )

    const button = screen.getByRole("button", { name: "Join lobby" })
    expect(button.closest('[data-slot="tooltip-trigger"]')).toBeNull()

    await user.hover(button)
    expect(document.querySelector('[data-slot="tooltip-content"]')).toBeNull()

    await user.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it("shows non-nullish content on hover", async () => {
    const user = userEvent.setup()

    render(
      <TooltipProvider>
        <Tooltip content="Rejoin your active match" delayDuration={0}>
          <button type="button">Join lobby</button>
        </Tooltip>
      </TooltipProvider>
    )

    await user.hover(screen.getByRole("button", { name: "Join lobby" }))

    expect(
      await screen.findByText("Rejoin your active match", {
        selector: '[data-slot="tooltip-content"]',
      })
    ).toBeTruthy()
  })
})
