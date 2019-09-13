//@flow
const map: {[string]: () => mixed} = {    "CustomerAccountPosting": () => Promise.resolve({"_TypeModel":{"name":"CustomerAccountPosting","since":3,"type":"AGGREGATED_TYPE","id":79,"rootId":"CmFjY291bnRpbmcATw","versioned":false,"encrypted":false,"values":{"_id":{"id":80,"type":"CustomId","cardinality":"One","final":true,"encrypted":false},"amount":{"id":84,"type":"Number","cardinality":"One","final":true,"encrypted":true},"balance":{"id":85,"type":"Number","cardinality":"One","final":true,"encrypted":true},"invoiceNumber":{"id":83,"type":"String","cardinality":"ZeroOrOne","final":true,"encrypted":true},"type":{"id":81,"type":"Number","cardinality":"One","final":true,"encrypted":true},"valueDate":{"id":82,"type":"Date","cardinality":"One","final":true,"encrypted":true}},"associations":{},"app":"accounting","version":"4"}}),
    "CustomerAccountReturn": () => Promise.resolve({"_TypeModel":{"name":"CustomerAccountReturn","since":3,"type":"DATA_TRANSFER_TYPE","id":86,"rootId":"CmFjY291bnRpbmcAVg","versioned":false,"encrypted":true,"values":{"_format":{"id":87,"type":"Number","cardinality":"One","final":false,"encrypted":false},"_ownerGroup":{"id":88,"type":"GeneratedId","cardinality":"ZeroOrOne","final":true,"encrypted":false},"_ownerPublicEncSessionKey":{"id":89,"type":"Bytes","cardinality":"ZeroOrOne","final":true,"encrypted":false},"outstandingBookingsPrice":{"id":92,"type":"Number","cardinality":"One","final":false,"encrypted":false}},"associations":{"postings":{"id":90,"type":"AGGREGATION","cardinality":"Any","final":false,"refType":"CustomerAccountPosting"}},"app":"accounting","version":"4"}}),
}
export default map