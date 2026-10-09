import { Children, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react'

/**
 * Resolve the async Server Components in a tree into elements jsdom can render.
 *
 * `render(await SomePage())` is enough while a page awaits everything itself, and every
 * suite here does exactly that. A page that puts its read behind a `<Suspense>` — which
 * `/boat-management` and `/boat-performance` do, so the sailor gets a skeleton instead of
 * a blank hold — hands back a tree with an *unresolved* async component inside it, and
 * `react-dom/client` cannot call one: it renders the fallback and stops. That is the
 * skeleton, not the screen, so the suite would be asserting about the wrong thing.
 *
 * So the async components are called here instead, the way the server calls them, and
 * what comes back is the settled screen. Only functions declared `async` are called;
 * a Client Component is a plain function and is left for React, because calling one
 * outside a render would run its hooks with no renderer to serve them.
 */
export async function resolveServerTree(node: ReactNode): Promise<ReactNode> {
  if (Array.isArray(node)) {
    return Promise.all(node.map((child) => resolveServerTree(child)))
  }

  if (!isValidElement(node)) return node

  const element = node as ReactElement<{ children?: ReactNode }>

  if (isAsyncComponent(element.type)) {
    const render = element.type as unknown as (props: unknown) => Promise<ReactNode>
    return resolveServerTree(await render(element.props))
  }

  // Anything else — a host element, a Suspense boundary, a Client Component — keeps its
  // own type, but its props may still hold something async. Every element-valued prop, not
  // only `children`: a Client Component handed a Server Component as a plain prop is how a
  // tab's content gets its own `<Suspense>` boundary without the tab strip waiting on it
  // (`/boat-performance`), and the server resolves an element wherever in the tree it sits.
  const resolved = await resolveElementProps(element.props as Record<string, unknown>)

  if (element.props?.children === undefined) {
    return Object.keys(resolved).length === 0 ? element : cloneElement(element, resolved)
  }

  return cloneElement(
    element,
    resolved,
    ...Children.toArray(await resolveServerTree(element.props.children))
  )
}

/** Every prop other than `children` that holds an element, resolved. Empty when none does. */
async function resolveElementProps(
  props: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}

  for (const [name, value] of Object.entries(props ?? {})) {
    if (name === 'children') continue
    const holdsElement = Array.isArray(value) ? value.some(isValidElement) : isValidElement(value)
    if (!holdsElement) continue

    out[name] = await resolveServerTree(value as ReactNode)
  }

  return out
}

/**
 * Only a function *declared* `async` is called here. A Client Component is a plain
 * function whose hooks need a renderer, and a host element's type is a string.
 */
function isAsyncComponent(type: ReactElement['type']): boolean {
  return typeof type === 'function' && type.constructor.name === 'AsyncFunction'
}
