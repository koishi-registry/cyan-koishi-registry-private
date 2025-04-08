import _l from 'npm:lodash';

export const missings: string[] = [];

export function info(text: string) {
  console.log('%c I %c %s', 'background-color: cyan', 'color: cyan', text);
}

export async function notFound(name: string) {
  missings.push(name);
  const packageName = versions1[name][0];
  const resp = await fetch(`https://registry.npmjs.org/${packageName}`);
  if (resp.status === 200)
    console.log(
      '%c E %c %s%c is not found',
      'background-color: red',
      'color: darkwhite; font-weight: bold',
      name,
      'color: red',
    );
  else
    console.log(
      '%c E %c %s%c is not found (!)',
      'background-color: red',
      'color: darkwhite; font-weight: bold',
      name,
      'color: red',
      resp.status,
    );
}

export const [obj1, obj2] = await Promise.all(
  [
    fetch('https://koishi-registry.yumetsuki.moe/index.json'),
    fetch('http://127.0.0.1:8000/'),
  ].map((fut) => fut.then((r) => r.json()).then((o) => o.objects)),
);

export const [versions1, versions2] = [obj1, obj2]
  .map((x) =>
    x
      .map((item) =>
        item.ignored
          ? null
          : [item.shortname, [item.package.name, item.package.version]],
      )
      .filter(Boolean),
  )
  .map(Object.fromEntries);

export const shortnames1 = Object.keys(versions1).sort();
export const shortnames2 = Object.keys(versions2).sort();

export let counter = 0;
const tasks = [];
for (const shortname of shortnames1) {
  if (shortnames2.findIndex((x) => x === shortname) === -1) {
    counter++;
    tasks.push(notFound(shortname));
  }
}
info(`total ${counter} plugins missing`);
await Promise.all(tasks);

export const PLUGINS_EQUAL = _l.isEqual(shortnames1, shortnames2);

export const version_mapped1 = shortnames1.map((name) => versions2[name]);
export const version_mapped2 = shortnames2.map((name) => versions1[name]);

export const VERSIONS_EQUAL = _l.isEqual(version_mapped1, version_mapped2);
