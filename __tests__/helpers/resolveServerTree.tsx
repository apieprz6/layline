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
  // own type, but its children may still hold something async.
  if (element.props?.children === undefined) return element

  return cloneElement(
    element,
    undefined,
    ...Children.toArray(await resolveServerTree(element.props.children))
  )
}

/**
 * Only a function *declared* `async` is called here. A Client Component is a plain
 * function whose hooks need a renderer, and a host element's type is a string.
 */
function isAsyncComponent(type: ReactElement['type']): boolean {
  return typeof type === 'function' && type.constructor.name === 'AsyncFunction'
}
