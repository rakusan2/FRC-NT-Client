import { Client } from '../'
const ntClient = new Client()
ntClient.start()
ntClient.addListener((key, val, type, id) => {
    console.log({ key, val, type, id })
})