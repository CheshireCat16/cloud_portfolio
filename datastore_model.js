// John Cheshire
// CS493 - Portfolio Assigment
// Example REST API for a shipping company where users own boats that can carry loads
// Data model for accessing boats, users, and loads API through Google Datastore
// Code adapted from examples at https://github.com/GoogleCloudPlatform/nodejs-getting-started/blob/8bb3d70596cb0c1851cd587d393faa76bfad8f80/2-structured-data/books/model-datastore.js
// Retrieved April 13, 2022


'use strict';

// Set up the datastore variable
const {Datastore} = require("@google-cloud/datastore");
const { call } = require("body-parser");
const config = require("./config/config.js");

// Constants for the two kinds of entities we handle
const boats = "Boats";
const loads = "Loads";


// Start datastore with configured project name, configured for either local or google cloud if env port is set
var ds
if (process.env.PORT) {
  ds = new Datastore({
    projectId: config.project
  });
} else {
  ds = new Datastore({
    projectId: config.project,
    apiEndpoint: 'http://localhost:8081'
  });
}

// Get a list of all the entities of the specified kind
module.exports.listEntities = function (kind, filter, limits, callback) {
    // Create the query for boats
    var query = ds.createQuery(kind)
    // Add filter if present
    if (filter !== null) {
        query.filter(filter["filterCol"], filter["operator"], filter["filterVar"]);
    }
    // Add limits if present
    if (limits !== null && limits["limit"] !== null) {
      query.limit(limits["limit"]);
      if (limits["token"] !== null) {
          query.start(limits["token"]);
      }
      
    }

    

    // Run the query
    ds.runQuery(query, (err, entities, hasNext) => {
        if (err) {
            console.log("error running query");
            console.log(err);
            return;
        }
        console.log(hasNext);
        // Send the found entities back to the calling function
        const hasMore = hasNext.moreResults !== Datastore.NO_MORE_RESULTS ? hasNext.endCursor : false;
        console.log(hasNext.moreResults);
        console.log(hasMore);
        callback(null, entities.map(fromDatastore), hasMore);
    })
}

// Create a new entity of the specified kind
module.exports.createEntity = function (data, kind, callback) {
    // Call the generic update function
    update(null, data, kind, callback);
}

// Update an existing entity of the specified kind
module.exports.updateEntity = function (id, data, kind, callback) {
  // Call the generic update function
  update(id, data, kind, callback);
}


// Get a single entity of the specified kind
module.exports.getEntity = function (kind, id, callback) {
    // Call the generic get entity function
    read(kind, id, callback);
}

// Delete an entity of the specified kind
module.exports.deleteEntity = function (kind, id, callback) {
  // Set up the key and call delete
  const key = ds.key([kind, parseInt(id, 10)])

  // If we are deleting a boat, need to ensure it is removed from all slips
  // if (kind == boats) {
  //   // Search for slip where boat is currently at
  //   let findSlipQuery = ds.createQuery(slips)
  //     .filter("current_boat", "=", id);
  //       // Run the query
  //       ds.runQuery(findSlipQuery, (err, entities) => {
  //         if (err) {
  //             console.log("Slip Error: ")
  //             console.log(err);
  //             return;
  //         }
  //         // If we have a slip with this boat in it, we need to remove it from the slip
  //         console.log(entities.length);
  //         if (entities.length > 0) {
  //           // Get the slip with the boat in it
  //           let curSlip = entities[0];
  //           var curSlipData = fromDatastore(curSlip);
  //           // Store the ID for the function call and remove from the data
  //           var id = curSlipData["id"];
  //           delete curSlipData["id"];
  //           // Clear out the boat, since it is being deleted
  //           curSlipData["current_boat"] = null
  //           update(id, curSlipData, slips, (err, entity) => {
  //             if (err) {
  //               console.log(err);
  //             } else {
  //               console.log(entity);
  //             }
  //           });
  //         }
  //     });
  // }

  // First confirm the key is valid
  read(kind, id, (err, entity) => {
    if (err) {
      callback(err);
    } else {
      ds.delete(key, (err) => {
        if (err) {
          console.log("error reading");
          console.log(err);          
          callback(err);
        } else {
          callback(null);
        }
      });
    }
  });
}

// Read in the information from a single entity
function read (kind, id, callback) {
  const key = ds.key([kind, parseInt(id, 10)]);
  ds.get(key, (err, entity) => {
    if (!err && !entity) {
      err = {
        code: 404,
        message: {"Error": "No entity with this ID found."}
      };
    }
    if (err) {
      callback(err);
      return;
    }
    callback(null, fromDatastore(entity));
  });
}

// Function to update or create an entity
function update (id, data, kind, callback) {
  // If an ID was passed in, the entity is being updated
  let key;
  if (id) {
    key = ds.key([kind, parseInt(id, 10)]);
  // otherwise the entity will be edited
  } else {
    key = ds.key(kind,);
  }

  // Create the new / updated entity
  const entity = {
    key: key,
    data: toDatastore(data)
  };

  // Save the entity to the DB
  ds.save(entity, (err, apiResponse) => {
      if (err) {
        callback(err, null);
      } else {       
        // Update the ID if one didn't exist (this was a new entity)
        if (!id) {
          id = apiResponse["mutationResults"][0]["key"]["path"][0].id;
        }
        // Get the information back from the DB to confirm ID and entity info
        read(kind, id, (err, newEntity) => {
          callback(err, newEntity);
        });
      }
  });
}

// Put object into datastore format
function toDatastore (obj) {
  // Hold results here
  const results = [];
  // Loop through each key and push onto results
  Object.keys(obj).forEach((k) => {
    if (obj[k] === undefined) {
      return;
    }
    results.push({
      name: k,
      value: obj[k],
      excludeFromIndexes: false
    });
  });
  return results;
}

// Turn datastore into json object by getting the ID of the from the KEY and setting it as the regular JSON id
function fromDatastore(obj) {
  obj.id = obj[Datastore.KEY].id;
  return obj;
}