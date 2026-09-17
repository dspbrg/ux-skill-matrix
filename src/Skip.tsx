/**
 * Overslaan naar de inhoud.
 *
 * De opmaak hiervoor stond er al, maar niets rende hem — dus moest wie met het
 * toetsenbord werkt eerst door de hele kopbalk heen. Wrang op een tool waarin
 * een team zichzelf op toegankelijkheid scoort.
 *
 * Een knop en geen <a href="#hoofd">, want deze app gebruikt de hash als
 * router: die link zou de route vervangen door #hoofd en je terugwerpen naar
 * het inlogscherm. De knop verplaatst de focus zelf, en <main> heeft
 * tabIndex={-1} zodat die daar ook echt landt.
 */
export function Skip() {
  return (
    <button
      className="skip"
      onClick={() => {
        const hoofd = document.getElementById('hoofd')
        hoofd?.focus()
        hoofd?.scrollIntoView()
      }}
    >
      Naar de inhoud
    </button>
  )
}
