require([
  "esri/Map", "esri/views/MapView", "esri/layers/FeatureLayer", "esri/layers/GraphicsLayer", "esri/Graphic",
  "esri/widgets/Home", "esri/widgets/Locate", "esri/widgets/Legend", "esri/widgets/BasemapGallery", "esri/widgets/Expand",
  "esri/widgets/ScaleBar", "esri/widgets/Search", "esri/widgets/Measurement", "esri/widgets/FeatureTable"
], function (
  Map, MapView, FeatureLayer, GraphicsLayer, Graphic,
  Home, Locate, Legend, BasemapGallery, Expand,
  ScaleBar, Search, Measurement, FeatureTable
) {
  const config = window.APP_CONFIG;
  const $ = (id) => document.getElementById(id);

  let features = [];
  let filtered = [];
  let displayField;
  let selected = null;
  let homeExtent = null;
  let lastCoords = "";

  $("appTitle").textContent = config.title;
  document.title = config.title;

  const layer = new FeatureLayer({
    url: config.layerUrl,
    title: config.layerTitle,
    outFields: ["*"],
    popupEnabled: false
  });

  const selectionLayer = new GraphicsLayer({ listMode: "hide" });
  const map = new Map({ basemap: config.basemap, layers: [layer, selectionLayer] });
  const view = new MapView({
    container: "viewDiv",
    map,
    center: config.initialCenter,
    zoom: config.initialZoom
  });

  const table = new FeatureTable({
    view,
    layer,
    container: "tableDiv",
    visibleElements: {
      menuItems: {
        clearSelection: true,
        refreshData: true,
        toggleColumns: true,
        selectedRecordsShowAllToggle: true
      }
    }
  });

  view.ui.add(new Home({ view }), "top-left");
  view.ui.add(new Locate({ view }), "top-left");
  view.ui.add(new Search({ view }), "top-right");
  view.ui.add(new ScaleBar({ view, unit: "metric" }), "bottom-left");

  const legendExpand = new Expand({ view, content: new Legend({ view }), expandIcon: "legend", expandTooltip: "Legend", group: "tools" });
  const basemapExpand = new Expand({ view, content: new BasemapGallery({ view }), expandIcon: "basemap", expandTooltip: "Basemaps", group: "tools" });
  const measurement = new Measurement({ view, activeTool: null });
  const measureExpand = new Expand({ view, content: measurement, expandIcon: "measure", expandTooltip: "Measure", group: "tools" });
  view.ui.add([legendExpand, basemapExpand, measureExpand], "top-right");

  const label = (feature) => String(
    (feature.attributes || {})[displayField] ??
    (feature.attributes || {})[layer.objectIdField] ??
    "Unnamed area"
  );

  const systemField = (field) =>
    field.type === "oid" ||
    field.type === "geometry" ||
    config.hiddenFields.includes(field.name);

  function formatValue(value, field) {
    if (value === null || value === undefined || value === "") return null;
    if (field.domain && field.domain.codedValues) {
      const match = field.domain.codedValues.find((item) => String(item.code) === String(value));
      if (match) return match.name;
    }
    if (field.type === "date") {
      const date = new Date(value);
      if (!Number.isNaN(date.valueOf())) {
        return new Intl.DateTimeFormat("en-AU", { day: "2-digit", month: "short", year: "numeric" }).format(date);
      }
    }
    return String(value);
  }

  function detailsAsText(feature) {
    return layer.fields
      .filter((field) => !systemField(field))
      .map((field) => {
        const value = formatValue(feature.attributes[field.name], field);
        return value === null ? null : `${field.alias || field.name}: ${value}`;
      })
      .filter(Boolean)
      .join("\n");
  }

  function showDetails(feature) {
    $("detailsTitle").textContent = label(feature);
    $("detailsBody").innerHTML = "";
    let count = 0;

    layer.fields.forEach((field) => {
      if (systemField(field)) return;
      const value = formatValue(feature.attributes[field.name], field);
      if (value === null) return;

      const row = document.createElement("div");
      const fieldLabel = document.createElement("div");
      const fieldValue = document.createElement("div");
      row.className = "detailRow";
      fieldLabel.className = "detailLabel";
      fieldValue.className = "detailValue";
      fieldLabel.textContent = field.alias || field.name;
      fieldValue.textContent = value;
      row.append(fieldLabel, fieldValue);
      $("detailsBody").append(row);
      count += 1;
    });

    if (!count) $("detailsBody").textContent = "No populated attributes returned.";
    $("details").classList.add("open");
  }

  function selectFeature(feature, zoom = true) {
    selected = feature;
    document.querySelectorAll(".item").forEach((item) => {
      item.classList.toggle("active", item.dataset.oid === String(feature.attributes[layer.objectIdField]));
    });

    selectionLayer.removeAll();
    selectionLayer.add(new Graphic({
      geometry: feature.geometry,
      symbol: {
        type: "simple-fill",
        color: [255, 215, 0, 0.18],
        outline: { color: [51, 48, 40], width: 3 }
      }
    }));

    showDetails(feature);
    table.highlightIds.removeAll();
    table.highlightIds.add(feature.attributes[layer.objectIdField]);

    if (zoom) {
      const target = feature.geometry.extent
        ? feature.geometry.extent.expand(config.selectionPadding)
        : feature.geometry;
      view.goTo(target).catch(() => {});
    }
  }

  function clearSelection() {
    selected = null;
    selectionLayer.removeAll();
    $("details").classList.remove("open");
    document.querySelectorAll(".item").forEach((item) => item.classList.remove("active"));
    table.highlightIds.removeAll();
  }

  function renderList() {
    const query = $("search").value.trim().toLowerCase();
    const field = $("fieldFilter").value;
    const fieldValue = $("valueFilter").value;

    filtered = features.filter((feature) =>
      label(feature).toLowerCase().includes(query) &&
      (!field || !fieldValue || String(feature.attributes[field]) === fieldValue)
    );

    $("list").innerHTML = "";
    $("resultCount").textContent = `${filtered.length} ${filtered.length === 1 ? "area" : "areas"}`;

    filtered.forEach((feature) => {
      const listItem = document.createElement("li");
      const button = document.createElement("button");
      button.className = "item";
      button.type = "button";
      button.textContent = label(feature);
      button.dataset.oid = feature.attributes[layer.objectIdField];
      if (selected && button.dataset.oid === String(selected.attributes[layer.objectIdField])) button.classList.add("active");
      button.addEventListener("click", () => selectFeature(feature, true));
      listItem.append(button);
      $("list").append(listItem);
    });
  }

  function buildFieldFilter() {
    layer.fields
      .filter((field) => !systemField(field) && ["string", "small-integer", "integer"].includes(field.type))
      .forEach((field) => {
        const option = document.createElement("option");
        option.value = field.name;
        option.textContent = field.alias || field.name;
        $("fieldFilter").append(option);
      });
  }

  function buildValueFilter() {
    const fieldName = $("fieldFilter").value;
    $("valueFilter").innerHTML = '<option value="">All values</option>';
    $("valueFilter").disabled = !fieldName;
    if (!fieldName) return renderList();

    const field = layer.fields.find((item) => item.name === fieldName);
    const values = [...new Set(features.map((feature) => feature.attributes[fieldName]).filter((value) => value !== null && value !== undefined && value !== ""))]
      .sort((a, b) => String(a).localeCompare(String(b)));

    values.forEach((value) => {
      const option = document.createElement("option");
      option.value = String(value);
      option.textContent = formatValue(value, field);
      $("valueFilter").append(option);
    });
    renderList();
  }

  function downloadFile(name, type, text) {
    const anchor = document.createElement("a");
    const objectUrl = window.URL.createObjectURL(new Blob([text], { type }));
    anchor.href = objectUrl;
    anchor.download = name;
    anchor.click();
    window.URL.revokeObjectURL(objectUrl);
  }

  function exportCsv() {
    const fields = layer.fields.filter((field) => !systemField(field));
    const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const rows = [
      fields.map((field) => escape(field.alias || field.name)).join(","),
      ...filtered.map((feature) => fields.map((field) => escape(formatValue(feature.attributes[field.name], field) ?? "")).join(","))
    ];
    downloadFile(`${config.exportBaseName}.csv`, "text/csv", rows.join("\n"));
  }

  function exportGeoJson() {
    const collection = {
      type: "FeatureCollection",
      features: filtered.map((feature) => ({
        type: "Feature",
        properties: feature.attributes,
        geometry: feature.geometry && feature.geometry.rings
          ? { type: "Polygon", coordinates: feature.geometry.rings }
          : null
      }))
    };
    downloadFile(`${config.exportBaseName}.geojson`, "application/geo+json", JSON.stringify(collection, null, 2));
  }

  $("search").addEventListener("input", renderList);
  $("clearSearch").addEventListener("click", () => { $("search").value = ""; renderList(); });
  $("fieldFilter").addEventListener("change", buildValueFilter);
  $("valueFilter").addEventListener("change", renderList);
  $("closeDetails").addEventListener("click", clearSelection);
  $("clearSel").addEventListener("click", clearSelection);
  $("zoomSelected").addEventListener("click", () => selected && selectFeature(selected, true));
  $("copyAttributes").addEventListener("click", () => selected && navigator.clipboard.writeText(detailsAsText(selected)));
  $("reset").addEventListener("click", () => {
    clearSelection();
    $("search").value = "";
    $("fieldFilter").value = "";
    buildValueFilter();
    if (homeExtent) view.goTo(homeExtent);
  });
  $("toggleLayer").addEventListener("click", () => {
    layer.visible = !layer.visible;
    $("toggleLayer").textContent = layer.visible ? "Hide layer" : "Show layer";
  });
  $("tableBtn").addEventListener("click", () => $("tableWrap").classList.toggle("open"));
  $("closeTable").addEventListener("click", () => $("tableWrap").classList.remove("open"));
  $("csvBtn").addEventListener("click", exportCsv);
  $("geoBtn").addEventListener("click", exportGeoJson);
  $("copyCoords").addEventListener("click", () => lastCoords && navigator.clipboard.writeText(lastCoords));
  $("share").addEventListener("click", () => {
    const url = new URL(location.href);
    url.searchParams.set("x", view.center.longitude.toFixed(6));
    url.searchParams.set("y", view.center.latitude.toFixed(6));
    url.searchParams.set("z", view.zoom.toFixed(2));
    if (selected) url.searchParams.set("oid", selected.attributes[layer.objectIdField]);
    navigator.clipboard.writeText(url.toString());
    $("share").textContent = "Link copied";
    setTimeout(() => { $("share").textContent = "Copy map link"; }, 1400);
  });

  view.on("pointer-move", (event) => {
    const point = view.toMap(event);
    if (!point) return;
    lastCoords = `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}`;
    $("coords").textContent = `Lat ${point.latitude.toFixed(6)} | Lon ${point.longitude.toFixed(6)}`;
  });

  view.on("click", (event) => {
    view.hitTest(event, { include: layer }).then((response) => {
      const hit = response.results.find((result) => result.graphic && result.graphic.layer === layer);
      if (hit) selectFeature(hit.graphic, false);
    });
  });

  Promise.all([layer.load(), view.when()])
    .then(() => {
      displayField = layer.displayField || layer.objectIdField;
      homeExtent = layer.fullExtent && layer.fullExtent.expand(config.extentPadding);
      return layer.queryFeatures({
        where: "1=1",
        outFields: ["*"],
        returnGeometry: true,
        orderByFields: displayField ? [displayField] : []
      });
    })
    .then((result) => {
      features = result.features;
      filtered = features;
      buildFieldFilter();
      renderList();
      $("status").textContent = `${config.layerTitle} loaded`;
      $("loading").classList.add("hidden");

      const url = new URL(location.href);
      const x = Number(url.searchParams.get("x"));
      const y = Number(url.searchParams.get("y"));
      const z = Number(url.searchParams.get("z"));
      const oid = url.searchParams.get("oid");

      if (Number.isFinite(x) && Number.isFinite(y)) {
        view.goTo({ center: [x, y], zoom: Number.isFinite(z) ? z : config.initialZoom });
      } else if (homeExtent) {
        view.goTo(homeExtent);
      }

      if (oid) {
        const feature = features.find((item) => String(item.attributes[layer.objectIdField]) === oid);
        if (feature) selectFeature(feature, false);
      }
    })
    .catch((error) => {
      $("status").textContent = `Unable to load ${config.layerTitle}`;
      $("loading").textContent = "Map failed to load. Check the browser console.";
      console.error(error);
    });
});
