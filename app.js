// John Cheshire
// CS493 - Portfolio Assigment
// Example REST API for a shipping company where users own boats that can carry loads
// Code initially adapted from examples at https://github.com/GoogleCloudPlatform/nodejs-getting-started/blob/8bb3d70596cb0c1851cd587d393faa76bfad8f80/2-structured-data/books/api.js
// Retrieved April 13, 2022



// Set up requirements
const path = require(`path`);
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
app.enable('trust proxy');
// Used to promisify callback function 
// Example from: https://www.freecodecamp.org/news/how-to-make-a-promise-out-of-a-callback-function-in-javascript-d8ec35d1f981/
const util = require('util'); 

// Constants for the two kinds of entities we handle
const boats = "Boats";
const loads = "Loads";
const users = "Users";

// Set up express to use body parser and handle json
app.use(bodyParser.urlencoded({extended: true}));
app.use(express.json());

// Set up the correct model
const config = require("./config/config.js");
const model = require(`./${config.backend}_model.js`);


/////////////////////////////////////////////////////////////////////////
// Middleware Section
/////////////////////////////////////////////////////////////////////////

// Create middleware to verify if token is acceptable
// Based on code snippet https://stackabuse.com/authentication-and-authorization-with-jwts-in-express-js/
// Author: Janith Kasun
// Retrieved May 15, 2022
const verifyJwt = (req, res, next) => {
    // Get the authorization header
    const authHeader = req.headers.authorization;
    // check that we have an authorization header
    if (authHeader) {
        // Pull the token out of the authorization header
        const token = authHeader.split(' ')[1];
        // Verify the JWT is valid and set sub if valid
        const client = new google.auth.OAuth2(clientId);
        async function verify() {
          const ticket = await client.verifyIdToken({
              idToken: token,
              audience: clientId,
          });
          const payload = ticket.getPayload();
          req.user = payload['sub'];
          console.log("Authorization Checked: ")
          console.log(req.user);
          next();
        }
        // If we had any kind of error, assume that we cannot verify the token, so don't set user name
        verify().catch(() => {
            next();
        });
    } else {
        console.log("After check")
        console.log(req.user);
        next();
    } 
}


/////////////////////////////////////////////////////////////////////////
// User Section
/////////////////////////////////////////////////////////////////////////

// GET all registered users
app.get('/users', (req, res) => {
    if (req.header("Accept") == "application/json" || req.header("Accept") == "*/*") {
        model.listEntities(users, null, null, (err, entities, hasNext) => {
            if (err) {
                res.status(500);
                res.json({"Error": "Server error getting boats"});
            } else {
                res.status(200);
                res.json(entities);
            }   
        });       
    }
    else {
        notAcceptable(res);
    }
});



/////////////////////////////////////////////////////////////////////////
// Boat API Section
/////////////////////////////////////////////////////////////////////////

// GET all boats
// Display a list of all boats
app.get('/boats', (req, res) => {
    //////// Add pagination
    var pages = {"limit": 3};
    pages["token"] = req.query["token"];
    
    model.listEntities(boats, null, pages, (err, entities, hasNext) => {
        if (err) {
            res.status(500);
            res.json({"Error": "Server error getting boats"});
        }
        // Set up results variables
        var results = {"boats": []};

        // Update entities to include loads
        addAllLoads(req, res, entities, () => {
            results["boats"] = entities;
            // Set up next link
            console.log(hasNext);
            
            if (hasNext) {
                results["next"] = getPage(req, hasNext, "/boats");
            }
            res.status(200);
            res.json(results);
        });

    });
});

// GET specific boat
// Get information about a specific boat
app.get('/boats/:id', (req, res) => {
    model.getEntity(boats, req.params.id, (err, entity) => {
        // Check for errors
        if (err) {
            res.status(404);
            res.json({"Error": "No boat with this boat_id exists"});
        } else {
            res.status(200);
            // set up filter
            filter = {
                "filterCol": "carrier",
                "filterVar": req.params.id,
                "operator": "="
            }
            console.log("Getting all loads")
            // Find all loads that are assigned to this boat
            model.listEntities(loads, filter, null, (err, entities, hasNext) => {
                if (err) {
                    res.status(500);
                    res.json({"Error": "An unexpected error has occured"});
                } else {
                addLoad(req, entity, entities);
                // Update the self link of the boat
                entity["self"] = getSelf(req, entity["id"], "/boats/");
                res.json(entity);
                }
            });
        }
    });
});

// POST new boat
// Create a new boat
app.post('/boats', (req, res) => {
    const newBoat = req.body;
    // Confirm request for boat has all required parameters
    if (isBadBoat(newBoat)) {
        badRequestBoat(res);
    } else {
    // Attempt to create the boat if all parameters were present and a loads item
        model.createEntity(newBoat, boats, (err, newEntity) => {
            if (err) {
                res.status(500);
                let error = {"Error": "A server error occurred"}
                res.json(error);
            } else {
                res.status(201);
                // Add empty loads
                newEntity["loads"] = [];
                // add self link to new entity
                newEntity["self"] = getSelf(req, newEntity["id"], "/boats/");
                res.json(newEntity);
            }
        });
    }
});

// DELETE existing boat
app.delete('/boats/:id', (req, res) => {
    model.deleteEntity(boats, req.params.id, (err) => {
        if (err) {
            res.status(404);
            res.json({"Error": "No boat with this boat_id exists"});
        } else {
            // set up filter
            filter = {
                        "filterCol": "carrier",
                        "filterVar": req.params.id,
                        "operator": "="
                    }
            // Find all loads that are assigned to this boat
            model.listEntities(loads, filter, null, (err, entities, hasNext) => {
                if (err) {
                    res.status(500);
                    res.json({"Error": "An unexpected error has occured"});
                } else {
                removeLoad(entities);
                }
            });            
            res.status(204);
            res.send();
        }
    });
});

// Put a load onto a boat
app.put('/boats/:boat_id/loads/:load_id', (req, res) => {
    // First confirm there is a boat with that ID and a load with that ID
    model.getEntity(loads, req.params.load_id, (err, load) => {
        if (err) {
            res.status(404);
            res.json({"Error": "The specified boat and/or load does not exist"});
            return;
        } else {
            // The load exists, so find the boat
            model.getEntity(boats, req.params.boat_id, (err, boat) => {
                if (err) {
                    res.status(404);
                    res.json({"Error": "The specified boat and/or load does not exist"});
                    return;                   
                } else {
                    // Confirm the load is not already on a boat
                    if (load["carrier"] !== null) {
                        res.status(403);
                        res.json({"Error": "The load is already loaded on another boat"});
                        return;
                    }                    
                    // The boat exists and the load not on a boat, so update its position in the load
                    load["carrier"] = boat["id"]
                    let id = load["id"];
                    // Remove ID from load for updating only data
                    delete load["id"];
                    model.updateEntity(id, load, loads, (err, newEntity) => {
                        if (err) {
                            res.status(500);
                            let error = {"Error": "A server error occurred"}
                            res.json(error);
                        } else {
                            res.status(204);
                            res.send();
                        }
                    });
                }
            });

        }
    })    
});

// Remove a load from a boat
app.delete('/boats/:boat_id/loads/:load_id', (req, res) => {
    // First confirm there is a boat with that ID and a load with that ID
    model.getEntity(loads, req.params.load_id, (err, load) => {
        if (err) {
            res.status(404);
            res.json({"Error": "No boat with this boat_id is loaded with the load with this load_id"});
            return;
        } else {
            // The load exists, so find the boat
            model.getEntity(boats, req.params.boat_id, (err, boat) => {
                if (err) {
                    res.status(404);
                    res.json({"Error": "No boat with this boat_id is loaded with the load with this load_id"});
                    return;                   
                } else {
                    // Confirm the specified load is on the boat
                    if (parseInt(load["carrier"]) != req.params.boat_id) {
                        res.status(404);
                        res.json({"Error": "No boat with this boat_id is loaded with the load with this load_id"});
                        return;
                    }                    
                    // The boat exists and the load is on the boat, so remove it from the boat
                    load["carrier"] = null
                    let id = load["id"];
                    // Remove ID from load for updating only data
                    delete load["id"];
                    model.updateEntity(id, load, loads, (err, newEntity) => {
                        if (err) {
                            res.status(500);
                            let error = {"Error": "A server error occurred"}
                            res.json(error);
                        } else {
                            res.status(204);
                            res.send();
                        }
                    });
                }
            });

        }
    })    
});

/////////////////////////////////////////////////////////////////////////
// Loads API Section
/////////////////////////////////////////////////////////////////////////

// GET all loads
// Display a list of all loads
app.get('/loads', (req, res) => {
   //////// Add pagination
   var pages = {"limit": 3};
   pages["token"] = req.query["token"];

   console.log("Getting Load");

    model.listEntities(loads, null, pages, (err, entities, hasNext) => {
        if (err) {
            res.status(500);
            res.json({"Error": "Server error getting loads"});
            return;
        }
        // Set up results variables
        console.log("Setting up load results");
        var results = {"loads": []};

        // Update entities with carrier info
        addAllCarriers(req, res, entities, () => {
            console.log("Added carriers");
            if (hasNext) {
                results["next"] = getPage(req, hasNext, "/loads");
            }
            results["loads"] = entities;
            res.status(200);
            res.json(results);
        });
    });
});

// GET specific load
// Get information about a specific load
app.get('/loads/:id', (req, res) => {
    model.getEntity(loads, req.params.id, (err, entity) => {
        // Check for errors
        if (err) {
            res.status(404);
            res.json({"Error": "No load with this load_id exists"});
        } else {
            // If the load is assigned to a boat, we need to get the name
            if (entity["carrier"] !== null) {
                model.getEntity(boats, entity["carrier"], (err, boat) => {
                    if (err) {
                        res.status(500);
                        res.json({"Error": "Server error getting loads"});                        
                    } else {
                        updateCarrier(req, entity, boat["name"]);
                        res.status(200);
                        entity["self"] = getSelf(req, entity["id"], "/loads/");
                        res.json(entity);
                    }
                });
            } else {
                // Set up load information if required
                updateCarrier(req, entity, null);
                res.status(200);
                entity["self"] = getSelf(req, entity["id"], "/loads/");
                res.json(entity);
            }
        }
    });
});

// POST new load
// Create a new load
app.post('/loads', (req, res) => {
    const newLoad = req.body;
    // Confirm request for boat has all required parameters
    if (isBadLoad(newLoad)) {
        badRequestLoad(res);
    } else {
    // Attempt to create the boat if all parameters were present
        // Set the current boat to null
        newLoad["carrier"] = null;
        model.createEntity(newLoad, loads, (err, newEntity) => {
            if (err) {
                res.status(500);
                let error = {"Error": "A server error occurred"}
                res.json(error);
            } else {
                res.status(201);
                newEntity["self"] = getSelf(req, newEntity["id"], "/loads/");
                res.json(newEntity);
            }
        });
    }
});

// DELETE existing load
app.delete('/loads/:id', (req, res) => {
    model.deleteEntity(loads, req.params.id, (err) => {
        if (err) {
            res.status(404);
            res.json({"Error": "No load with this load_id exists"});
        } else {
            res.status(204);
            res.send();
        }
    });
});

// Get all loads on a given boat
app.get("/boats/:boat_id/loads", (req, res) => {
    // First confirm the boat exists
    model.getEntity(boats, req.params.boat_id, (err, boat) => {
        if (err) {
            res.status(404);
            res.json({"Error": "No boat with this boat_id exists"});
        } else {
            // Find all loads that are assigned to this boat
            filter = {
                "filterCol": "carrier",
                "filterVar": req.params.boat_id,
                "operator": "="
            }
            model.listEntities(loads, filter, null, (err, entities, hasNext) => {
                if (err) {
                    res.status(500);
                    res.json({"Error": "An unexpected error has occured"});
                } else {
                    // Setup results array to return 
                    results = {"loads": []};
                    for (let index = 0; index < entities.length; index++) {
                        curLoad = entities[index];
                        updateCarrier(req, curLoad, boat["name"]);
                        curLoad["self"] = getSelf(req, curLoad.id, "/loads/");
                        results["loads"].push(curLoad);
                    }
                    res.status(200);
                    res.json(results);
                }
            });
        }
    });
});

// PUT a boat into a load
app.put('/loads/:load_id/:boat_id', (req, res) => {
    model.getEntity(loads, req.params.load_id, (err, load) => {
        if (err) {
            res.status(404);
            res.json({"Error": "The specified boat and/or load does not exist"});
            return;
        } else {
            // The load exists, so find the boat
            model.getEntity(boats, req.params.boat_id, (err, boat) => {
                if (err) {
                    res.status(404);
                    res.json({"Error": "The specified boat and/or load does not exist"});
                    return;                   
                } else {
                    // Confirm there is room at the load
                    if (load["current_boat"] !== null) {
                        res.status(403);
                        res.json({"Error": "The load is not empty"});
                        return;
                    }                    
                    // The boat exists and the load is empty, so update its position in the load
                    load["current_boat"] = boat["id"]
                    let id = load["id"];
                    // Remove ID from load for updating only data
                    delete load["id"];
                    model.updateEntity(id, load, loads, (err, newEntity) => {
                        if (err) {
                            res.status(500);
                            let error = {"Error": "A server error occurred"}
                            res.json(error);
                        } else {
                            res.status(204);
                            res.send();
                        }
                    });
                }
            });

        }
    })
});

// DELETE a boat from a load
app.delete('/loads/:load_id/:boat_id', (req, res) => {
    model.getEntity(loads, req.params.load_id, (err, load) => {
        if (err) {
            res.status(404);
            res.json({"Error": "No boat with this boat_id is at the load with this load_id"});
            return;
        } else {
            // Confirm the boat is in the load
            if (load["current_boat"] != req.params.boat_id) {
                res.status(404);
                res.json({"Error": "No boat with this boat_id is at the load with this load_id"});
                return;
            }
            // The load exists and is empty, so find the boat
            model.getEntity(boats, req.params.boat_id, (err, boat) => {
                if (err) {
                    res.status(404);
                    res.json({"Error": "No boat with this boat_id is at the load with this load_id"});
                    return;                   
                } else {
                    // The boat exists, so update its position in to be removed from the load
                    load["current_boat"] = null;
                    let id = load["id"];
                    // Remove ID from load for updating only data
                    delete load["id"];
                    model.updateEntity(id, load, loads, (err, newEntity) => {
                        if (err) {
                            res.status(500);
                            let error = {"Error": "A server error occurred"}
                            res.json(error);
                        } else {
                            res.status(204);
                            res.send();
                        }
                    });
                }
            });

        }
    })    
});

/////////////////////////////////////////////////////////////////////////
// Helper functions
/////////////////////////////////////////////////////////////////////////

// Confirm if a new or updated boat has all required attributes
function isBadBoat(newBoat) {
    if (newBoat.name == null || newBoat.type == null || newBoat.length == null) {
        return true;
    } else {
        return false;
    }
}

// Confirm if a new or updated load has all required attributes
function isBadLoad(newLoad) {
    if (newLoad.volume == null || newLoad.item == null || newLoad.creation_date == null) {
        return true;
    } else {
        return false;
    }
}

// Set and return an error when an object is missing properties
function badRequestBoat(res) {
    res.status(400);
    let error = {"Error": "The request object is missing at least one of the required attributes"}
    res.json(error);
}

// Set and return an error when an object is missing properties
function badRequestLoad(res) {
    res.status(400);
    let error = {"Error": "The request object is missing at least one of the required attributes"}
    res.json(error);
}

// Start server and listen on specified port or 8080
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}...`);
});

// Generate a self link
function getSelf(req, id, route) {
    return req.protocol + "://" + req.get("host") + route + id;
}

// Generate a page link
function getPage(req, token, route) {
    return req.protocol + "://" + req.get("host") + route + "?token=" + token;
}

// Add loads to a boat
function addLoad(req, boat, loadList) {
    // Add a loads section to the boat and loop through all loads that were found 
    boat["loads"] = [];
    for (let index = 0; index < loadList.length; index++) {
        boat["loads"].push({
            "self": getSelf(req, loadList[index].id, "/loads/"),
            "id": loadList[index].id
        });
    }
}

// Removes all loads from a boat
function removeLoad(loadList) {
    // Loop through and remove each load
    for (let index = 0; index < loadList.length; index++) {
        // Remove the load from the boat
        var load = loadList[index];
        load["carrier"] = null
        let id = load["id"];
        // Remove ID from load for updating only data
        delete load["id"];
        model.updateEntity(id, load, loads, (err, newEntity) => {
            if (err) {
                console.log("Error deleting load");
            }
        });        
    }
}

// Update carrier field with id and self link
function updateCarrier(req, load, name) {
    // Set up load information if required
    if (load["carrier"] !== null) {
        load["carrier"] = {
            "id": load["carrier"],
            "self": getSelf(req, load["carrier"], "/boats/"),
            "name": name
        }
    }
}

// Loop through boats and add all entities
async function addAllLoads(req, res, boatList, callback) {
    // Used to promisify callback function 
    // Example from: https://www.freecodecamp.org/news/how-to-make-a-promise-out-of-a-callback-function-in-javascript-d8ec35d1f981/
    const getLoads = util.promisify(model.listEntities);    
    for (var index = 0; index < boatList.length; index++) {
        var boat = boatList[index];
        // set up filter
        filter = {
            "filterCol": "carrier",
            "filterVar": boat["id"],
            "operator": "="
        }
        // Find all loads that are assigned to this boat
        await getLoads(loads, filter, null).then(data => {
            addLoad(req, boat, data);
            boat["self"] = getSelf(req, boat["id"], "/boats/");
        }).catch(err => {
            console.log(err);
            res.status(500);
            res.json({"Error": "A Server error occurred"});
        });
    }
    callback();
}

// Add carriers to all loads
async function addAllCarriers(req, res, loadList, callback) {
    // Used to promisify callback function 
    // Example from: https://www.freecodecamp.org/news/how-to-make-a-promise-out-of-a-callback-function-in-javascript-d8ec35d1f981/
    const getBoat = util.promisify(model.getEntity);    

    // Loop through all the loads and add a carrier to them
    for (var index = 0; index < loadList.length; index++) {
        {
            var load = loadList[index];

            // If the load is assigned to a boat, we need to get the name
            if (load["carrier"] !== null) {
                await getBoat(boats, load["carrier"]).then(data => {
                    updateCarrier(req, load, data["name"]);
                    load["self"] = getSelf(req, load["id"], "/loads/");
                }).catch( err => {
                    console.log(err);
                    res.status(500);
                    res.json({"Error": "A server error occurred"});
                })
            } else {
                // Set up load information if required
                updateCarrier(req, load, null);
                load["self"] = getSelf(req, load["id"], "/loads/");
            }
        }
    }
    callback();
}

// Send a 406 not acceptable response
function notAcceptable(res) {
    res.status(406);
    res.json({"Error": "The requested MIME type in the Accept header is not supported"});
}