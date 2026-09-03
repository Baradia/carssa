export class Input {
    constructor() {
        this.keys = { w: false, a: false, s: false, d: false, space: false, r: false, esc: false };
        this.justPressed = { r: false, esc: false };
        
        window.addEventListener('keydown', (e) => this.onKey(e, true));
        window.addEventListener('keyup', (e) => this.onKey(e, false));
    }

    onKey(e, isDown) {
        const keyMap = {
            'w': 'w', 'ArrowUp': 'w',
            'a': 'a', 'ArrowLeft': 'a',
            's': 's', 'ArrowDown': 's',
            'd': 'd', 'ArrowRight': 'd',
            ' ': 'space',
            'r': 'r',
            'Escape': 'esc'
        };

        const mapped = keyMap[e.key.length === 1 ? e.key.toLowerCase() : e.key];
        if (mapped) {
            if (isDown && !this.keys[mapped]) this.justPressed[mapped] = true;
            this.keys[mapped] = isDown;
        }
    }

    isJustPressed(key) {
        if (this.justPressed[key]) {
            this.justPressed[key] = false;
            return true;
        }
        return false;
    }
}