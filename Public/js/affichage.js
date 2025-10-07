// AFFICHAGE
const btnHorloge = document.querySelector(".H");
const btnPauses = document.querySelector(".P");
const btnClicker = document.querySelector(".C");
const btnMedals = document.querySelector(".M");


const horlogeSection = document.querySelector("h1");
const pausesSection = document.querySelector("ul");
const clickerSection = document.querySelector(".zone-wrap");
const medalsSection = document.querySelector(".medals-wrap");


function toggleSection(element) {
    const currentState = element.getAttribute("data-state");

    if (currentState === "shown") {
        element.style.visibility = "hidden";
        element.setAttribute("data-state", "hidden");
    } else {
        element.style.visibility = "visible";
        element.setAttribute("data-state", "shown");
    }
}


btnHorloge.addEventListener("click", () => {
    toggleSection(horlogeSection);
});

btnPauses.addEventListener("click", () => {
    toggleSection(pausesSection);
});

btnClicker.addEventListener("click", () => {
    toggleSection(clickerSection);
});

btnMedals.addEventListener("click", () => {
    toggleSection(medalsSection);
});
