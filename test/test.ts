import { Client } from '../'
const ntClient = new Client()
ntClient.start((con, err) => {
    console.log({ con, err })
    if(!con)throw err
})
ntClient.addListener((key, val, type, id) => {
    console.log({ key, val, type, id })
})