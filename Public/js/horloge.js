// HORLOGE + PAUSES
const display = document.querySelector('h1');

function horloge() {
    let now = new Date();
    let h = now.getHours();
    let m = now.getMinutes();
    let s = now.getSeconds();

    if (h < 10) {
        h = '0' + h;
    }
    if (m < 10) {
        m = '0' + m;
    }
    if (s < 10) {
        s = '0' + s;
    }

    display.textContent = `[${h}:${m}:${s}]`; // Affichage

    let heureDecimale = h + (m / 60);

    const lis = document.querySelectorAll('li');

    lis.forEach((li) => {
        let debut = parseFloat(li.dataset.debutPause);
        let fin;

        li.classList.remove('pendant', 'fini', 'avenir');

        if (li != lis[2]) {
            fin = debut + 0.25; // 15 mn = 0.25 h
            if (heureDecimale >= debut && heureDecimale < fin) {
                li.classList.add('pendant');
            } else if (heureDecimale >= fin) {
                li.classList.add('fini');
            } else {
                li.classList.add('avenir');
            }
        } else {
            fin = debut + 1.00; // Pause midi = 1h et pas 15 mn
            if (heureDecimale >= debut && heureDecimale < fin) {
                li.classList.add('pendant');
            } else if (heureDecimale >= fin) {
                li.classList.add('fini');
            } else {
                li.classList.add('avenir');
            }
        }
    });
}

horloge();
setInterval(horloge, 1000);
