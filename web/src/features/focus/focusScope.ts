import { createContext, useContext } from 'react'

/**
 * Chave do trecho do currículo a que os campos do editor pertencem: o id do bloco ("abc"), de um cargo ou curso ("abc:1") ou de uma
 * linha ("abc:1#2"). Os blocos do editor e do currículo na tela marcam os seus elementos com data-focus-key; é assim que a prévia sabe que
 * trecho mostrar quando um campo é editado.
 */
export const FocusScope = createContext<string | null>(null)

export const useFocusScope = () => useContext(FocusScope)
