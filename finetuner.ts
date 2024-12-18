import Random from 'npm:inaba'

export function sigmoid(x: number, k: number, L: number, x_0: number) {
    return L / (1 + Math.exp(-k * (x - x_0)));
}

export function minmax(min: number, value: number, max: number): number {
    return Math.max(Math.min(value, max), min)
}

export function diff(x: number, y: number): number {
    return Math.abs(x - y);
}

export function effi(k: number, L: number, x_0: number): number {
    return 2 - minmax(0, [
        diff(0.00, sigmoid(0, k, L, x_0)) * 5,
        diff(0.15, sigmoid(200, k, L, x_0)) * 1,
        diff(0.35, sigmoid(300, k, L, x_0)) * 1,
        diff(0.60, sigmoid(400, k, L, x_0)) * 2,
        diff(0.75, sigmoid(500, k, L, x_0)) * 2,
        diff(0.85, sigmoid(600, k, L, x_0)) * 1,
        diff(1.00, sigmoid(800, k, L, x_0)) * 5,
    ].reduce((a, b) => a + b), 2);
}

export async function tuner(last_effi: number, tw: number, k: number, L: number, x_0: number) {
    const args = [k, L, x_0]
    const idx = Random.int(args.length + 1)
    args[idx] += (Random.real(tw) - tw / 2)
    const new_effi = effi(args[0], args[1], args[2])
    if (new_effi > last_effi) {
        console.log("tweaked\tk=%o\tL=%o\tx_0=%o\teffi=%o", ...args, new_effi)
        return [new_effi, ...args] as [number, number, number, number]
    } else return [last_effi, k, L, x_0] as const
}

if (import.meta.main) {
    let effi = 0
    let k = 0.01
    let L = 1
    let x_0 = 250
    while (effi < 2) {
        const tunes = await Promise.all(Array.from({ length: 10 },
            (_1, _2) => tuner(effi, 1, k, L, x_0)
        ))
        tunes.sort((a, b) => a[0] == b[0] ? 0 : (a[0] > b[0] ? -1 : 0))
        const best = tunes[0]
        if (best[0] > effi) {
            effi = best[0]
            k = best[1]
            L = best[2]
            x_0 = best[3]
        }
    }
}
