import type { Params } from '../../router'
import { METHOD_NAME_ALL } from '../../router'
import type { Pattern } from '../../utils/url'
import { getPattern, splitPath, splitRoutingPath } from '../../utils/url'

type HandlerSet<T> = {
  handler: T
  possibleKeys: string[]
  score: number
}

type HandlerParamsSet<T> = HandlerSet<T> & {
  params: Record<string, string>
}

export class Node<T> {
  #methods: Record<string, HandlerSet<T>>[]

  #children: Record<string, Node<T>>
  #patterns: Pattern[]
  #order: number = 0
  #params: Record<string, string> = Object.create(null)

  constructor(
    method?: string,
    handler?: T,
    children?: Record<string, Node<T>>,
  ) {
    this.#children = children || Object.create(null)
    this.#methods = []
    if (method && handler) {
      const m: Record<string, HandlerSet<T>> = Object.create(null)
      m[method] = { handler, possibleKeys: [], score: 0 }
      this.#methods = [m]
    }
    this.#patterns = []
  }

  insert(method: string, path: string, handler: T): Node<T> {
    this.#order = ++this.#order

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    let curNode: Node<T> = this
    const parts = splitRoutingPath(path)

    const possibleKeys: string[] = []

    for (let i = 0, len = parts.length; i < len; i++) {
      const p: string = parts[i]

      if (Object.keys(curNode.#children).includes(p)) {
        curNode = curNode.#children[p]
        const pattern = getPattern(p)
        if (pattern) {
          possibleKeys.push(pattern[1])
        }
        continue
      }

      curNode.#children[p] = new Node()

      const pattern = getPattern(p)
      if (pattern) {
        curNode.#patterns.push(pattern)
        possibleKeys.push(pattern[1])
      }
      curNode = curNode.#children[p]
    }

    const m: Record<string, HandlerSet<T>> = Object.create(null)

    const handlerSet: HandlerSet<T> = {
      handler,
      possibleKeys: possibleKeys.filter((v, i, a) => a.indexOf(v) === i),
      score: this.#order,
    }

    m[method] = handlerSet
    curNode.#methods.push(m)

    return curNode
  }

  // getHandlerSets
  #getHandlerSets(
    node: Node<T>,
    method: string,
    nodeParams: Record<string, string>,
    params: Record<string, string>,
  ): HandlerParamsSet<T>[] {
    const handlerSets: HandlerParamsSet<T>[] = []
    for (let i = 0, len = node.#methods.length; i < len; i++) {
      const m = node.#methods[i]
      const handlerSet = (m[method] || m[METHOD_NAME_ALL]) as HandlerParamsSet<
        T
      >
      const processedSet: Record<number, boolean> = {}
      if (handlerSet !== undefined) {
        handlerSet.params = Object.create(null)
        for (let i = 0, len = handlerSet.possibleKeys.length; i < len; i++) {
          const key = handlerSet.possibleKeys[i]
          const processed = processedSet[handlerSet.score]
          handlerSet.params[key] = params[key] && !processed
            ? params[key]
            : nodeParams[key] ?? params[key]
          processedSet[handlerSet.score] = true
        }

        handlerSets.push(handlerSet)
      }
    }
    return handlerSets
  }

  /**
   * Removes a handler associated with a specific method and path from the trie.
   *
   * @param method The HTTP method (e.g., GET, POST, etc.)
   * @param path The path associated with the handler
   * @returns true if the handler was removed, false otherwise
   */
  remove(method: string, path: string): boolean {
    let removed = false
    // deno-lint-ignore no-this-alias
    let currentNode: Node<T> | null = this
    const parts = splitRoutingPath(path)

    // Traverse the trie based on path segments
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLast = i === parts.length - 1

      if (currentNode) {
        currentNode = currentNode.#children[part]

        // If no child node exists for this path segment, stop traversal
        if (!currentNode) {
          break
        }

        // Check for wildcard match at this level
        if (isLast && currentNode.#children['*']) {
          removed = this.#removeHandlerFromChildren(
            currentNode.#children['*'],
            method,
          )
        }

        // Check for handler match for the current path segment and method
        const methodHandlers = currentNode.#methods.find((m) => m[method])
        if (methodHandlers && isLast) {
          removed = true
          const handlerIndex = currentNode.#methods.indexOf(methodHandlers)
          currentNode.#methods.splice(handlerIndex, 1)
        }
      }
    }

    return removed
  }

  /**
   * Recursively removes a handler from a child node and its descendants.
   *
   * @param node The child node to search
   * @param method The HTTP method
   * @returns true if a handler was removed, false otherwise
   */
  #removeHandlerFromChildren(node: Node<T>, method: string): boolean {
    let removed = false
    removed = removed || node.#methods.some((m, index) => {
      if (m[method]) {
        node.#methods.splice(index, 1)
        return true
      }
      return false
    })

    // Recursively check children for removal
    for (const childName in node.#children) {
      removed = removed ||
        this.#removeHandlerFromChildren(node.#children[childName], method)
    }

    // Prune empty nodes after removal
    if (
      node.#methods.length === 0 && Object.keys(node.#children).length === 0
    ) {
      delete this.#children[node.constructor.name]
    }

    return removed
  }

  search(method: string, path: string): [[T, Params][]] {
    const handlerSets: HandlerParamsSet<T>[] = []
    this.#params = Object.create(null)

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const curNode: Node<T> = this
    let curNodes = [curNode]
    const parts = splitPath(path)

    for (let i = 0, len = parts.length; i < len; i++) {
      const part: string = parts[i]
      const isLast = i === len - 1
      const tempNodes: Node<T>[] = []

      for (let j = 0, len2 = curNodes.length; j < len2; j++) {
        const node = curNodes[j]
        const nextNode = node.#children[part]

        if (nextNode) {
          nextNode.#params = node.#params
          if (isLast) {
            // '/hello/*' => match '/hello'
            if (nextNode.#children['*']) {
              handlerSets.push(
                ...this.#getHandlerSets(
                  nextNode.#children['*'],
                  method,
                  node.#params,
                  Object.create(null),
                ),
              )
            }
            handlerSets.push(
              ...this.#getHandlerSets(
                nextNode,
                method,
                node.#params,
                Object.create(null),
              ),
            )
          } else {
            tempNodes.push(nextNode)
          }
        }

        for (let k = 0, len3 = node.#patterns.length; k < len3; k++) {
          const pattern = node.#patterns[k]

          const params = { ...node.#params }

          // Wildcard
          // '/hello/*/foo' => match /hello/bar/foo
          if (pattern === '*') {
            const astNode = node.#children['*']
            if (astNode) {
              handlerSets.push(
                ...this.#getHandlerSets(
                  astNode,
                  method,
                  node.#params,
                  Object.create(null),
                ),
              )
              tempNodes.push(astNode)
            }
            continue
          }

          if (part === '') {
            continue
          }

          const [key, name, matcher] = pattern

          const child = node.#children[key]

          // `/js/:filename{[a-z]+.js}` => match /js/chunk/123.js
          const restPathString = parts.slice(i).join('/')
          if (matcher instanceof RegExp && matcher.test(restPathString)) {
            params[name] = restPathString
            handlerSets.push(
              ...this.#getHandlerSets(child, method, node.#params, params),
            )
            continue
          }

          if (matcher === true || matcher.test(part)) {
            params[name] = part
            if (isLast) {
              handlerSets.push(
                ...this.#getHandlerSets(child, method, params, node.#params),
              )
              if (child.#children['*']) {
                handlerSets.push(
                  ...this.#getHandlerSets(
                    child.#children['*'],
                    method,
                    params,
                    node.#params,
                  ),
                )
              }
            } else {
              child.#params = params
              tempNodes.push(child)
            }
          }
        }
      }

      curNodes = tempNodes
    }

    if (handlerSets.length > 1) {
      handlerSets.sort((a, b) => {
        return a.score - b.score
      })
    }

    return [
      handlerSets.map(({ handler, params }) =>
        [handler, params] as [T, Params]
      ),
    ]
  }
}
