export const sleep = (ms) => new Promise(r => setTimeout(r, ms))

export const randomBetween = (min, max) => 
    Math.floor(Math.random() * (max - min)) + min;

export const humanPause = async (min = 250, max = 600) => {
    await sleep(randomBetween(min, max))
}