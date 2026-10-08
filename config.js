window.APP_CONFIG = {
  title: "SCS Spatial Lab",
  layerTitle: "Team Areas",
  layerUrl: "https://services9.arcgis.com/n6hZlg3qgjAlTZRC/arcgis/rest/services/TeamAreas_Map_WFL1/FeatureServer/1",
  basemap: "topo-vector",
  initialCenter: [151.8, -32.9],
  initialZoom: 7,
  extentPadding: 1.1,
  selectionPadding: 1.45,
  hiddenFields: [
    "Shape__Area",
    "Shape__Length",
    "GlobalID",
    "CreationDate",
    "Creator",
    "EditDate",
    "Editor"
  ],
  exportBaseName: "team-areas"
};
