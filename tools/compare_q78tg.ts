import _l from 'npm:lodash'

export const [obj1, obj2] = await Promise.all([
  fetch('https://koishi-registry.yumetsuki.moe/index.json'),
  fetch('http://127.0.0.1:8000/'),
].map((fut) => fut.then((r) => r.json()).then((o) => o.objects)))

export const [versions1, versions2] = [obj1, obj2].map(
  (x) =>
    x.map((item) =>
      item.ignored ? null : [item.shortname, item.package.version]
    )
      .filter(Boolean),
)
  .map(Object.fromEntries)

export const shortnames1 = Object.keys(versions1).sort()
export const shortnames2 = Object.keys(versions2).sort()

export const PLUGINS_EQUAL = _l.isEqual(shortnames1, shortnames2)

export const version_mapped1 = shortnames1.map((name) => versions2[name])
export const version_mapped2 = shortnames2.map((name) => versions1[name])

export const VERSIONS_EQUAL = _l.isEqual(version_mapped1, version_mapped2)


