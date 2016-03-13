(function() {
    'use strict';
}());

// GOBAL VARIABLES
var map;
var markers = [];
var infoWindows = [];
var locationLimit = 7;
// Foursquare API Keys
var FOURSQUARE_ID = "YUHN3SIIMABMTH40QAZYJKEW3E3HCO2WZLCXKOFL20TCR1EO";
var FOURSQUARE_CLIENT = "CGMIRXJIOWUY141LQSS0E4BXPEPNC5DOUQUT4SEET2XEF0XX";
var initialPlaces = [];

// Gets the "venues" (location) data from foursquare API, in foursquare API objects are know as venues.
// getInitialPlaces is called when localStorage is empty, on first load or when you click on logo button
function getInitialPlaces() {
    // Calling 4square API
    var url = "https://api.foursquare.com/v2/venues/explore?ll=48.5834513,7.743634&section=topPicks&limit=" + locationLimit + "&radius=550&client_id=" + FOURSQUARE_ID + "&client_secret=" + FOURSQUARE_CLIENT + "&v=20130815";

    $.ajax({
            url: url,
            dataType: "jsonp"
        })
        .done(function(data) {
            buildInitialPlace(data.response.groups[0].items);
        })
        .fail(function(jqXHR, textStatus) {
            // Error handling
            $('#content').hide();
            $('.error-msg').show("slow");
        });

}

// Stores the "venues" (location) data from foursquare API to local storage
function buildInitialPlace(foursquareData) {

    var venueObjects = foursquareData;

    venueObjects.forEach(function(object) {
        var venue = {};
        venue.id = object.venue.id;
        venue.name = object.venue.name;
        venue.category = object.venue.categories[0].name;
        venue.icon = object.venue.categories[0].icon.prefix + "bg_32.png";
        venue.lat = object.venue.location.lat;
        venue.lng = object.venue.location.lng;
        venue.address = object.venue.location.address;
        venue.phone = object.venue.contact.phone;
        venue.fb = object.venue.contact.facebook;
        venue.url = object.venue.url;
        venue.rating = object.venue.rating;
        venue.photos = [];
        venue.isVisible = true;
        venue.isFavorite = false;

        // Gets the photos for each venue
        var photoUrl = "https://api.foursquare.com/v2/venues/" + venue.id + "/photos?limit=5&client_id=" + FOURSQUARE_ID + "&client_secret=" + FOURSQUARE_CLIENT + "&v=20160301";
        var arrayPhotoObject = [];
        $.ajax({
                url: photoUrl,
                dataType: "jsonp"
            })
            .done(function(data) {
                // foursquare returns an photo array object, we store an array of src's in photos property of the venue
                arrayPhotoObject = data.response.photos.items;
                arrayPhotoObject.forEach(function(src) {
                    venue.photos.push(src.prefix + "width300" + src.suffix);
                });

                initialPlaces.push(venue);

                // When all request's return response, as they are asynchronus
                if (initialPlaces.length === locationLimit) {
                    // Stocks the data received from 4square and formatted by the function
                    localStorage.initialPlaces = JSON.stringify(initialPlaces);
                    // Apply bindings on it
                    applyKo();
                    // Show side-bar content
                    $('#content').fadeIn("fast");
                }
            })
            .fail(function(jqXHR, textStatus) {
                // Error handling
                $('#content').hide();
                $('.error-msg').show("slow");
            });

    });

}

// Location constructor
var Place = function(data) {

    var self = this;

    this.id = ko.observable(data.id);
    this.name = ko.observable(data.name);
    this.lat = ko.observable(data.lat);
    this.lng = ko.observable(data.lng);
    this.address = ko.observable(data.address);
    this.phone = ko.observable(data.phone);
    this.fb = ko.observable(data.fb);
    this.url = ko.observable(data.url);
    this.photos = ko.observableArray(data.photos);
    this.isVisible = ko.observable(data.isVisible);
    this.isFavorite = ko.observable(data.isFavorite);
    this.rating = ko.observable(data.rating);
    this.category = ko.observable(data.category);

    // Based on isFavorite property, the map icons are either favorite stars or simple icons
    this.icon = ko.computed(function() {
        if (!self.isFavorite()) {
            return data.icon;
        } else {
            return "img/favorite-star.png";
        }
    }, this);

    // If a location is favorite change star icon to gold icon
    this.starIcon = ko.computed(function() {
        if (self.isFavorite() === true) {
            return "img/star-gold.png";
        } else {
            return "img/star-grey.png";
        }
    }, this);

};


var ViewModel = function() {

    var self = this;

    // Stock a list of each Location object
    this.Locationlist = ko.observableArray([]);

    // Set an array for each Location name, will be needed for autocomplete function in the search bar
    self.locationNameAuto = [];

    var initialLocations = JSON.parse(localStorage.initialPlaces);

    initialLocations.forEach(function(locationItem) {
        self.Locationlist.push(new Place(locationItem));
        self.locationNameAuto.push({ label: locationItem.name, id: locationItem.id });
    });



    // Create markers
    this.Locationlist().forEach(makeMarker);

    // Stocks the location that was clicked
    this.selectedLocation = ko.observable();

    // When a location is selected by user
    this.showLocation = function(selected) {
        // Marker and infoWindow properties added to each Location
        var marker = selected.marker;
        var infoWindow = selected.infoWindow;

        toggleBounce.bind(marker)();

        hideInfoWindows();
        infoWindow.open(map, marker);

        self.selectedLocation(selected);

    };

    // Makes a location favorite or not
    this.toggleMakeFav = function(selected) {

        var marker = selected.marker;
        var infoWindow = selected.infoWindow;

        // toggle favorite
        var favState = !selected.isFavorite();

        selected.isFavorite(favState);

        if (favState) {
            marker.setIcon("img/favorite-star.png");
        } else {
            marker.setIcon(selected.icon());
        }

        self.selectedLocation(selected);

        // When a location is added as favorite, this information is changed to the local storage too
        // Search for the newly favorite location object
        var indexOfSelected = self.Locationlist().indexOf(self.selectedLocation());

        initialLocations[indexOfSelected].isFavorite = favState;
        localStorage.initialPlaces = JSON.stringify(initialLocations);

        // Animation
        toggleBounce.bind(marker)();
        hideInfoWindows();
        infoWindow.open(map, marker);

    };

    // Autocomplete with ko.js

    // the user text
    this.searchText = ko.observable("");

    this.availableLocations = function(e) {
        var n = "";
        var locationMatched = ko.observableArray();
        var inputText = self.searchText().toLowerCase();
        // filter if there a match between string and the array of text locations
        self.locationNameAuto.forEach(function(location) {
            n = (location.label.toLowerCase()).indexOf(inputText);
            if (n !== -1) {
                locationMatched.push(location.id);
            }
        });

        showMatchedLocationsko(locationMatched);
    };

    // Renders the filtered markers
    var showMatchedLocationsko = function(locationMatched) {
        reloadMarkers();
        self.Locationlist().forEach(function(LocationItem) {
            // if the id is in the location list
            var checks = ko.utils.arrayFirst(locationMatched(), function(item) {
                return item === LocationItem.id();
            });

            // Location become visible or not. checks retruen true or false
            LocationItem.isVisible(checks);

        });
        // Recreate markers
        self.Locationlist().forEach(makeMarker);
    };

    /* // For autocomplete and search filter in the search bar
     var matchedLocation = [];

     // Using jquery autocomplete
     $("#searchBar").autocomplete({
         // Defining source with all the location name's
         source: self.locationNameAuto,
         minLength: 0,
         response: function(event, locationName) {
             if (locationName.content) {
                 matchedLocation = [];
                 // As we only need the data response, the menu is always closed
                 $("#searchBar").autocomplete("close");
                 // Collecting id's of matched locations
                 for (var i = 0; i < locationName.content.length; i++) {
                     matchedLocation.push(locationName.content[i].id);
                 }
                 showMatchedLocations(matchedLocation);
             } else {
                 showMatchedLocations("all");
             }
         }
     });

     // Renders the filtered markers
     var showMatchedLocations = function(matchedLocation) {
         reloadMarkers();
         self.Locationlist().forEach(function(LocationItem) {
             // Check si id same as matchedLocation array
             if (matchedLocation === "all") {
                 LocationItem.isVisible(true);
             } else if ($.inArray(LocationItem.id(), matchedLocation) === -1) {
                 LocationItem.isVisible(false);
             } else {
                 LocationItem.isVisible(true);
             }
         });
         // Recreate markers
         self.Locationlist().forEach(makeMarker);
     };*/

    function hideInfoWindows() {
        self.Locationlist().forEach(function(LocationItem) {
            LocationItem.infoWindow.close();
        });
    }


};

// Either create or use the existing venue data's
function launchMap() {
    if (!localStorage.initialPlaces) {
        initMap();
        getInitialPlaces();
    } else {
        initMap();
        applyKo();
    }
}

function applyKo() {
    ko.applyBindings(new ViewModel());
    $('#content').fadeIn("fast");
}

// Google Map
function initMap() {
    var mapDiv = document.getElementById("gmap");
    map = new google.maps.Map(mapDiv, {
        center: { lat: 48.5834513, lng: 7.743634 },
        zoom: 15,
        mapTypeControl: false,
    });



    // Custom Styles
    map.set('styles', [{ "featureType": "administrative", "elementType": "labels.text.fill", "stylers": [{ "color": "#444444" }] }, { "featureType": "landscape", "elementType": "all", "stylers": [{ "color": "#f2f2f2" }] }, { "featureType": "poi", "elementType": "all", "stylers": [{ "visibility": "off" }] }, { "featureType": "road", "elementType": "all", "stylers": [{ "saturation": -100 }, { "lightness": 45 }] }, { "featureType": "road.highway", "elementType": "all", "stylers": [{ "visibility": "simplified" }] }, { "featureType": "road.highway", "elementType": "geometry", "stylers": [{ "visibility": "simplified" }, { "color": "#ff6a6a" }, { "lightness": "0" }] }, { "featureType": "road.highway", "elementType": "labels.text", "stylers": [{ "visibility": "on" }] }, { "featureType": "road.highway", "elementType": "labels.icon", "stylers": [{ "visibility": "on" }] }, { "featureType": "road.arterial", "elementType": "all", "stylers": [{ "visibility": "on" }] }, { "featureType": "road.arterial", "elementType": "geometry.fill", "stylers": [{ "color": "#ff6a6a" }, { "lightness": "75" }] }, { "featureType": "road.arterial", "elementType": "labels.icon", "stylers": [{ "visibility": "off" }] }, { "featureType": "road.local", "elementType": "geometry.fill", "stylers": [{ "lightness": "75" }] }, { "featureType": "transit", "elementType": "all", "stylers": [{ "visibility": "off" }] }, { "featureType": "transit.line", "elementType": "all", "stylers": [{ "visibility": "on" }] }, { "featureType": "transit.station.bus", "elementType": "all", "stylers": [{ "visibility": "on" }] }, { "featureType": "transit.station.rail", "elementType": "all", "stylers": [{ "visibility": "on" }] }, { "featureType": "transit.station.rail", "elementType": "labels.icon", "stylers": [{ "weight": "0.01" }, { "hue": "#ff0028" }, { "lightness": "0" }] }, { "featureType": "water", "elementType": "all", "stylers": [{ "visibility": "on" }, { "color": "#80e4d8" }, { "lightness": "25" }, { "saturation": "-23" }] }]);

}

// Responsive map

// Calculates the heights of elements in the page above the maps. Want the map to fit right in
var totalUpElementsHeights = $("#search").height() + $("#logo").height() + $("#content").height() + ($(window).height()) / 6;
$("#gmap").height($(window).height() - totalUpElementsHeights);

$(window).resize(function() {
    var totalUpElementsHeights = $("#search").height() + $("#logo").height() + $("#content").height() + ($(window).height()) / 6;
    $("#gmap").height($(window).height() - totalUpElementsHeights);
});

function makeMarker(locationData) {

    if (locationData.isVisible()) {

        // Uses the icon from the venue category
        var image = locationData.icon();

        var marker = new google.maps.Marker({
            position: { lat: locationData.lat(), lng: locationData.lng() },
            map: map,
            animation: google.maps.Animation.DROP,
            title: locationData.name(),
            icon: image
        });

        marker.addListener('click', toggleBounce);

        var fbString = "";
        var urlString = "";

        // TODO : For undefined value, search for an more elegant way of dealing with it
        // Deleting parts with no data

        if (locationData.fb()) {
            fbString = '<a class="network-link" target="_blank" href="https://www.facebook.com/' + locationData.fb() + '"><img src="img/FB-f-Logo__blue_29.png"/></a>';
        }

        if (locationData.url()) {
            urlString = '<a class="network-link" target="_blank" href="' + locationData.url() + '"><img src="img/web-site.png"/></a>';
        }

        if (!locationData.phone()) {
            locationData.phone("");
        }

        if (!locationData.address()) {
            locationData.address("");
        }

        // Concat photos elements
        var photosArray = locationData.photos();
        var photoString = "";
        for (var i = 0; i < photosArray.length; i++) {
            photoString += '<a href="#" data-featherlight="' + photosArray[i] + '"><img class="info-thumbnail" alt="2" src="' + photosArray[i] + '"></a>';
        }


        // Info window string data
        var contentString = '<div id="info-content"><div class="info-image" title="Based on foursquare.com ratings"style="background-image: linear-gradient( rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.2)), url(' + locationData.photos()[0] + ');"><span class="info-rating">' + locationData.rating() + '</span></div><div class="info-text"><div class="info-title">' + locationData.name() + '</div><div class="info-address">' + locationData.address() + '</div><div class="info-category">' + locationData.category() + '</div><div class="info-photos">' + photoString + '</div><div class="network-info">' + fbString + urlString + '<span class="info-phone">' + locationData.phone() + '</span></div></div></div></div>';


        var infoWindow = new google.maps.InfoWindow({
            content: contentString
        });

        google.maps.event.addListener(marker, "click", function() {
            clearInfoWindow();
            infoWindow.open(map, marker);
            $(".locationItem").removeClass("active");
        });

        // Associate marker with the location

        locationData.marker = marker;
        locationData.infoWindow = infoWindow;

        markers.push(marker);
        infoWindows.push(infoWindow);

    }

}


// Animation of markers when location selected or clicked
function toggleBounce() {
    var marker = this;
    marker.setAnimation(google.maps.Animation.BOUNCE);
    setTimeout(function() {
        marker.setAnimation(null);
    }, 2150);
}

// Close all window info
function clearInfoWindow() {

    for (var i = 0; i < infoWindows.length; i++) {

        infoWindows[i].close();
    }

}

function reloadMarkers() {
    // Loop through markers and set map to null for each
    for (var i = 0; i < markers.length; i++) {

        markers[i].setMap(null);
    }
    // Reset the markers array
    markers = [];
}
