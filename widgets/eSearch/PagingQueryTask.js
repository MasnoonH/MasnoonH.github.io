///////////////////////////////////////////////////////////////////////////
// Robert Scheitlin WAB eSearch Widget
///////////////////////////////////////////////////////////////////////////
/*global define, console*/
define(['dojo/_base/declare',
  'dojo/Evented',
  'dojo/on',
  'dojo/_base/lang',
  'dojo/_base/html',
  'esri/tasks/query',
  'esri/tasks/QueryTask',
  'esri/tasks/FeatureSet',
  'dojo/keys',
  'dojo/date/locale'
],
  function (declare, Evented, on, lang, html, Query, QueryTask, FeatureSet, keys, locale) {
    return declare([Evented], {
      baseClass: 'search-paging-query-task',
      uri: '',
      fieldName: '',
      query: null,
      queryTask: null,
      objectIdsArray: [],
      iStart: 0,
      iMaxRecords: 0,
      isQuerying: false,
      featuresProcessed: 0,
      featuresTotal: 0,
      dateFormat: '',
      useUTC: true,
      blankStringExists: false,
      allString: 'all',
      defExpr: '',
      version: 0,
      allValues: [],
      uniqueValues: [],
      esc: false,
      isRequired: false,
      maxRecordCount: 250,
      nullsExist: false,

      //events:
      //pagingComplete
      //pagingFault
      //featuresProcessed
      //featuresTotal

      startup: function () {
        this.inherited(arguments);
        this.query = new Query();
      },

      execute: function () {
        this.uniqueValues = [];
        this.blankStringExists = false;
        this.iStart = 0;
        this.iMaxRecords = 0;
        this.featuresProcessed = 0;
        this.featuresTotal = 0;

        this.isQuerying = true;
        this.query.returnGeometry = false;
        this.query.outFields = [this.fieldName];
        if (this.version > 10.11) {
          this.query.orderByFields = [this.fieldName];
        }
        this.query.objectIds = null;
        if (this.defExpr && this.defExpr !== "") {
          this.query.where = this.defExpr;
        } else {
          this.query.where = "1=1";
        }
        if (this.uri === '') {
          this.emit('pagingFault');
          return;
        }
        // console.info(this.uri);
        this.queryTask = new QueryTask(this.uri);
        if (this.version >= 10.1) {
          //need to check if the feature count is over maxRecordCount
          var cntQuery = new Query();
          if (this.defExpr && this.defExpr !== "") {
            cntQuery.where = this.defExpr;
          } else {
            cntQuery.where = "1=1";
          }
          cntQuery.returnDistinctValues = true;
          cntQuery.outFields = [this.fieldName];
          this.queryTask.executeForCount(cntQuery, lang.hitch(this, function(count){
            this.featuresTotal = count;
            if(count <= this.maxRecordCount){
              this.allValues = [];
              this.query.returnDistinctValues = true;
              this.queryTask.execute(this.query, lang.hitch(this, this.onSearchFinish), lang.hitch(this, this.onSearchError));
            }else{
              delete this.query.orderByFields;
              this.queryTask.executeForIds(this.query, lang.hitch(this, this.onSearchIdsFinish), lang.hitch(this, this.onSearchError));
            }
          }));
        } else {
          this.queryTask.executeForIds(this.query, lang.hitch(this, this.onSearchIdsFinish), lang.hitch(this, this.onSearchError));
        }
      },

      onSearchFinish: function (featureSet) {
        var uVal;
        this.query.where = "";
        this.query.text = null;
        if (this.version < 10.1 || this.featuresTotal > this.maxRecordCount) {
          this.featuresProcessed += featureSet.features.length;
          this.emit('featuresProcessed', this.featuresProcessed);
        }

        var resultCount = featureSet.features.length;
        for (var i = 0; i < resultCount; i++) {
          var featureAttributes = featureSet.features[i].attributes;
          for (var attr in featureAttributes) {
            if(featureAttributes[attr] === null){
              this.nullsExist = true;
            }
            if(featureAttributes[attr]){
              this.allValues.push(featureAttributes[attr]);
            }
          }
        }

        if (this.version >= 10.1 && this.featuresTotal <= this.maxRecordCount) {
          this.isQuerying = false;
          if (this.dateFormat !== "") {
            this.replaceDatesWithStrings();
            return;
          } else {
            this.uniqueValues = this.getDistinctValues(this.allValues);
            if (this.isRequired === false) {
              if (this.blankStringExists) {
                uVal = {
                  code: ' ',
                  name: '" "'
                };
                this.uniqueValues.splice(0, 0, uVal);
              }
              uVal = {
                code: '',
                name: ''
              };
              this.uniqueValues.splice(0, 0, uVal);
            }
            this.uniqueValues.push({
              code: 'allu',
              name: this.allString
            });
            this.emit('pagingComplete', this.uniqueValues);
            return;
          }
        } else {
          //check to see if all records were returned.
          if (this.featuresProcessed >= this.objectIdsArray.length) {
            // get the unique values
            this.uniqueValues = this.getDistinctValues(this.allValues);
            //console.info(this.uniqueValues);
            if (this.dateFormat !== "") {
              this.replaceDatesWithStrings();
              return;
            } else {
              if (this.isRequired === false) {
                if (this.blankStringExists) {
                  uVal = {
                    code: ' ',
                    name: '" "'
                  };
                  this.uniqueValues.splice(0, 0, uVal);
                }
                uVal = {
                  code: '',
                  name: ''
                };
                this.uniqueValues.splice(0, 0, uVal);
              }
              this.uniqueValues.push({
                code: 'allu',
                name: this.allString
              });
              this.emit('pagingComplete', this.uniqueValues);
              this.isQuerying = false;
              return;
            }
          }

          // check to see if max records has been determined.
          // add the max records to the start index as these have already been queried.
          if (this.iMaxRecords === 0) {
            this.iMaxRecords = this.featuresProcessed;
            this.iStart += this.iMaxRecords;
          }

          // Query the server for the next lot of features
          // Use the objectids as the input for the query.
          // Do not continue if the esc is true.
          if (this.iStart < this.objectIdsArray.length && this.esc === false) {
            //If we get this far we need to requery the server for the next lot of records
            this.isQuerying = true;
            this.query.objectIds = this.objectIdsArray.slice(this.iStart, this.iStart + this.iMaxRecords);
            this.queryTask.execute(this.query, lang.hitch(this, this.onSearchFinish), lang.hitch(this, this.onSearchError));

            this.iStart += this.iMaxRecords;
          }

          //reset the escape parameter if it was triggered.
          if (this.esc === true) {
//            console.info("we have escaped the paging");
            this.esc = false;
            this.isQuerying = false;
            this.emit('pagingComplete', this.uniqueValues);
          }

          // get the unique values
          this.uniqueValues = this.getDistinctValues(this.allValues);
        }
      },

      _formatDate: function (value, dateFormat) {
        if (this.dateFormat) {
          this.dateFormat = this.dateFormat.replace(/D/g, "d").replace(/Y/g, "y");
        }
        var inputDate = new Date(value);
        return locale.format(inputDate, {
          selector: 'date',
          datePattern: dateFormat
        });
      },

      replaceDatesWithStrings: function () {
        var val;
        for (var i = 0; i < this.uniqueValues.length; i++) {
          var dateMS = Number(this.uniqueValues[i].code);
          if (!isNaN(dateMS)) {
            val = this._formatDate(dateMS, this.dateFormat);
          }
          this.uniqueValues[i].name = val;
          this.uniqueValues[i].code = val;
        }
        this.isQuerying = false;
        this.emit('pagingComplete', this.uniqueValues);
      },

      onSearchError: function () {
        this.objectIdsArray = [];
        this.isQuerying = false;
        this.esc = false;
        this.emit('pagingFault');
      },

      onSearchIdsFinish: function (results) {
        if (results.length > 0) {
          this.allValues = [];
          this.objectIdsArray = results;
          this.featuresTotal = this.objectIdsArray.length;
          this.emit('featuresTotal', this.featuresTotal);
          this.query.where = null;
          this.query.text = null;
          this.query.objectIds = this.objectIdsArray.slice(0, this.maxRecordCount);
          this.queryTask.execute(this.query, lang.hitch(this, this.onSearchFinish), lang.hitch(this, this.onSearchError));
        } else {
          console.error('onSearchIdsFinish returned zero length');
          this.isQuerying = false;
          this.esc = false;
          this.emit('pagingFault');
        }
      },

      getDistinctValues: function (array) {
        var flags = [],
          output = [],
          l = array.length,
          i;
        for (i = 0; i < l; i++) {
          if (flags[array[i]]){
            continue;
          }
          flags[array[i]] = true;
          if (array[i] === ' ') {
            this.blankStringExists = true;
            continue;
          }
          var uVal;
          if (array[i] === null) {
            uVal = {
              code: 'null',
              name: 'null'
            };
          } else {
            uVal = {
              code: array[i],
              name: array[i]
            };
          }
          output.push(uVal);
        }
        ///Add a null to the lists
        var retVal = sortByKey(output, "code");
//Change in 2.9 to see if we can allow null values back in the the unique dropdown
        if(this.nullsExist){
          retVal.unshift({code: 'null', name:'null'});
        }
        return retVal;

        function sortByKey(array, key) {
          return array.sort(function (a, b) {
            var x = a[key];
            var y = b[key];
            if (typeof x == "string") {
              x = x.toLowerCase().trim();
              y = y.toLowerCase().trim();
            }
            return ((x < y) ? -1 : ((x > y) ? 1 : 0));
          });
        }
      }
    });
  });
