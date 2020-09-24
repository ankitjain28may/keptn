import * as Highcharts from "highcharts";

declare var require: any;
const Boost = require('highcharts/modules/boost');
const noData = require('highcharts/modules/no-data-to-display');
const More = require('highcharts/highcharts-more');
const Heatmap = require("highcharts/modules/heatmap");
const Treemap = require("highcharts/modules/treemap");


Boost(Highcharts);
noData(Highcharts);
More(Highcharts);
noData(Highcharts);
Heatmap(Highcharts);
Treemap(Highcharts);

import * as moment from 'moment';
import {ChangeDetectorRef, Component, Input, OnDestroy, OnInit, TemplateRef, ViewChild} from '@angular/core';
import {DtChart, DtChartSeriesVisibilityChangeEvent} from "@dynatrace/barista-components/chart";

import {DataService} from "../../_services/data.service";
import DateUtil from "../../_utils/date.utils";
import {Trace} from "../../_models/trace";
import SearchUtil from "../../_utils/search.utils";
import {Subject} from "rxjs";
import {takeUntil} from "rxjs/operators";
import {MatDialog, MatDialogRef} from "@angular/material/dialog";

@Component({
  selector: 'ktb-evaluation-details',
  templateUrl: './ktb-evaluation-details.component.html',
  styleUrls: ['./ktb-evaluation-details.component.scss']
})
export class KtbEvaluationDetailsComponent implements OnInit, OnDestroy {

  private readonly unsubscribe$ = new Subject<void>();
  @Input() public showChart = true;

  @ViewChild('sloDialog')
  public sloDialog: TemplateRef<any>;
  public sloDialogRef: MatDialogRef<any, any>;

  private heatmapChart: DtChart;
  @ViewChild('heatmapChart') set heatmap(heatmap: DtChart) {
    this.heatmapChart = heatmap;
  }

  public _evaluationColor = {
    'pass': '#7dc540',
    'warning': '#e6be00',
    'fail': '#dc172a',
    'failed': '#dc172a',
    'info': '#f8f8f8'
  };

  public _evaluationState = {
    'pass': 'recovered',
    'warning': 'warning',
    'fail': 'error',
    'failed': 'error'
  };

  public _evaluationData: Trace;
  public _selectedEvaluationData: Trace;
  public _comparisonView: string = "heatmap";

  public _chartOptions: Highcharts.Options = {
    chart: {
      height: 400
    },
    legend: {
      maxHeight: 70
    },

    xAxis: {
      type: 'category',
      labels: {
        rotation: 90
      }
    },
    yAxis: [
      {
        title: null,
        labels: {
          format: '{value}',
        },
        min: 0,
        max: 100,
      },
      {
        title: null,
        labels: {
          format: '{value}',
        },
        opposite: true,
        tickInterval: 50,
      },
    ],
    plotOptions: {
      column: {
        stacking: 'normal',
        pointWidth: 5,
        minPointLength: 2,
        point: {
          events: {
            click: (event) => {
              this._chartSeriesClicked(event);
              return true;
            }
          }
        },
      },
    },
  };
  public _chartSeries: Highcharts.SeriesOptions[] = [
  ];

  public _heatmapOptions: Highcharts.Options = {
    chart: {
      type: 'heatmap',
      height: 400
    },

    xAxis: [{
      categories: [],
      plotBands: [],
      labels: {
        enabled: false
      },
    }],

    yAxis: [{
      categories: ["Score"],
      title: null,
      labels: {
        format: '{value}'
      },
    }],

    colorAxis: {
      dataClasses: Object.keys(this._evaluationColor).filter(key => key != 'failed').map((key) => { return { color: this._evaluationColor[key], name: key } })
    },

    plotOptions: {
      heatmap: {
        point: {
          events: {
            click: (event) => {
              this._heatmapTileClicked(event);
              return true;
            }
          }
        },
      },
    },
  };
  public _heatmapSeries: Highcharts.SeriesHeatmapOptions[] = [];

  @Input()
  get evaluationData(): any {
    return this._evaluationData;
  }
  set evaluationData(evaluationData: any) {
    if (this._evaluationData !== evaluationData) {
      this._evaluationData = evaluationData;
      this._changeDetectorRef.markForCheck();
    }
  }

  constructor(private _changeDetectorRef: ChangeDetectorRef, private dataService: DataService, private dialog: MatDialog) { }

  ngOnInit() {
    if(this._evaluationData) {
      this.dataService.loadEvaluationResults(this._evaluationData);
      if (!this._selectedEvaluationData && this._evaluationData.data.evaluationHistory)
        this.selectEvaluationData(this._evaluationData.data.evaluationHistory.find(h => h.shkeptncontext === this._evaluationData.shkeptncontext));
    }
    this.dataService.evaluationResults
      .pipe(takeUntil(this.unsubscribe$))
      .subscribe((event) => {
        if(this.evaluationData === event) {
          this.updateChartData(event.data.evaluationHistory);
          this._changeDetectorRef.markForCheck();
        }
      });
  }

  private parseSloFile(evaluationData) {
    if(evaluationData.data && evaluationData.data.evaluationdetails.sloFileContent && !evaluationData.data.evaluationdetails.sloFileContentParsed) {
      evaluationData.data.evaluationdetails.sloFileContentParsed = atob(evaluationData.data.evaluationdetails.sloFileContent);
      evaluationData.data.evaluationdetails.score_pass = evaluationData.data.evaluationdetails.sloFileContentParsed.split("total_score:")[1]?.split("pass:")[1]?.split("\"")[1]?.split("%")[0];
      evaluationData.data.evaluationdetails.score_warning = evaluationData.data.evaluationdetails.sloFileContentParsed.split("total_score:")[1]?.split("warning:")[1]?.split("\"")[1]?.split("%")[0];
      evaluationData.data.evaluationdetails.compare_with = evaluationData.data.evaluationdetails.sloFileContentParsed.split("comparison:")[1]?.split("compare_with:")[1]?.split("\"")[1];
      evaluationData.data.evaluationdetails.include_result_with_score = evaluationData.data.evaluationdetails.sloFileContentParsed.split("comparison:")[1]?.split("include_result_with_score:")[1]?.split("\"")[1];
      evaluationData.data.evaluationdetails.number_of_comparison_results = evaluationData.data.evaluationdetails.sloFileContentParsed.split("comparison:")[1]?.split("number_of_comparison_results:")[1]?.split(" ")[1];
    }
  }

  updateChartData(evaluationHistory) {
    let chartSeries = [];

    if(!this._selectedEvaluationData && evaluationHistory)
      this.selectEvaluationData(evaluationHistory.find(h => h.id === this._evaluationData.id));

    if(this.showChart) {
      evaluationHistory.forEach((evaluation) => {
        let scoreData = {
          y: evaluation.data.evaluationdetails ? evaluation.data.evaluationdetails.score : 0,
          evaluationData: evaluation,
          color: this._evaluationColor[evaluation.data.evaluationdetails.result],
          name: evaluation.getChartLabel(),
        };

        let indicatorScoreSeriesColumn = chartSeries.find(series => series.name == 'Score' && series.type == 'column');
        let indicatorScoreSeriesLine = chartSeries.find(series => series.name == 'Score' && series.type == 'line');
        if(!indicatorScoreSeriesColumn) {
          indicatorScoreSeriesColumn = {
            name: 'Score',
            type: 'column',
            data: [],
            cursor: 'pointer',
            turboThreshold: 0
          };
          chartSeries.push(indicatorScoreSeriesColumn);
        }
        if(!indicatorScoreSeriesLine) {
          indicatorScoreSeriesLine = {
            name: 'Score',
            type: 'line',
            data: [],
            cursor: 'pointer',
            visible: false,
            turboThreshold: 0
          };
          chartSeries.push(indicatorScoreSeriesLine);
        }

        indicatorScoreSeriesColumn.data.push(scoreData);
        indicatorScoreSeriesLine.data.push(scoreData);

        if(evaluation.data.evaluationdetails.indicatorResults) {
          evaluation.data.evaluationdetails.indicatorResults.forEach((indicatorResult) => {
            let indicatorData = {
              y: indicatorResult.value.value,
              indicatorResult: indicatorResult,
              evaluationData: evaluation,
              name: evaluation.getChartLabel(),
            };
            let indicatorChartSeries = chartSeries.find(series => series.name == indicatorResult.value.metric);
            if(!indicatorChartSeries) {
              indicatorChartSeries = {
                name: indicatorResult.value.metric,
                type: 'line',
                yAxis: 1,
                data: [],
                visible: false,
                turboThreshold: 0
              };
              chartSeries.push(indicatorChartSeries);
            }
            indicatorChartSeries.data.push(indicatorData);
          });
        }
      });
      this._chartSeries = [...chartSeries];

      this.updateHeatmapOptions(chartSeries);
      this._heatmapSeries = [
        {
          name: 'Score',
          type: 'heatmap',
          rowsize: 0.85,
          turboThreshold: 0,
          data: chartSeries.find(series => series.name == 'Score').data.map((s) => {
            let time = moment(s.evaluationData.time).format();
            let index = this._heatmapOptions.yAxis[0].categories.indexOf("Score");
            let x = this._heatmapOptions.xAxis[0].categories.indexOf(time);
            return {
              x: x,
              y: index,
              z: s.y,
              evaluation: s.evaluationData,
              color: this._evaluationColor[s.evaluationData.data.result]
            };
          })
        },
        {
          name: 'SLOs',
          type: 'heatmap',
          turboThreshold: 0,
          data: chartSeries.reverse().reduce((r, d) => [...r, ...d.data.filter(s => s.indicatorResult).map((s) => {
            let time = moment(s.evaluationData.time).format();
            let index = this._heatmapOptions.yAxis[0].categories.indexOf(s.indicatorResult.value.metric);
            let x = this._heatmapOptions.xAxis[0].categories.indexOf(time);
            return {
              x: x,
              y: index,
              z: s.indicatorResult.score,
              color: this._evaluationColor[s.indicatorResult.status]
            };
          })], [])
        },
      ];
    }

    this.highlightHeatmap();
    this._changeDetectorRef.markForCheck();
  }

  updateHeatmapOptions(chartSeries) {
    chartSeries.forEach((d) =>
      d.data.forEach((s) => {
        let time = moment(s.evaluationData.time).format();
        if(s.indicatorResult && this._heatmapOptions.yAxis[0].categories.indexOf(s.indicatorResult.value.metric) == -1)
          this._heatmapOptions.yAxis[0].categories.unshift(s.indicatorResult.value.metric);
        if(this._heatmapOptions.xAxis[0].categories.indexOf(time) == -1)
          this._heatmapOptions.xAxis[0].categories.splice(SearchUtil.binarySearch(this._heatmapOptions.xAxis[0].categories, time, (a, b) => moment(a).unix() - moment(b).unix()), 0, time);
      })
    );

    this._heatmapOptions.chart.height = this._heatmapOptions.yAxis[0].categories.length*28 + 60;
  }

  seriesVisibilityChanged(_: DtChartSeriesVisibilityChangeEvent): void {
    // NOOP
  }

  _chartSeriesClicked(event) {
    this.selectEvaluationData(event.point.evaluationData);
  }

  _heatmapTileClicked(event) {
    this.selectEvaluationData(this._heatmapSeries[0].data[event.point.x]['evaluation']);
  }

  selectEvaluationData(evaluation) {
    this.parseSloFile(evaluation);
    this._selectedEvaluationData = evaluation;
    this.highlightHeatmap();
  }

  highlightHeatmap() {
    let highlightIndex = this._heatmapOptions.xAxis[0].categories.indexOf(moment(this._selectedEvaluationData.time).format());
    let plotBands = [];
    if(highlightIndex >= 0)
      plotBands.push({
        borderWidth: 2,
        borderColor: '#6d6d6d',
        color: 'rgba(109,109,109,.4)',
        from: highlightIndex-0.5,
        to: highlightIndex+0.5,
        zIndex: 20
      });
    this._heatmapOptions.xAxis[0].plotBands = plotBands;
    this.heatmapChart?._update();
    this._changeDetectorRef.markForCheck();
  }

  getCalendarFormat() {
    return DateUtil.getCalendarFormats().sameElse;
  }

  getDuration(start, end) {
    return DateUtil.getDurationFormatted(start, end);
  }

  showSloDialog() {
    this.sloDialogRef = this.dialog.open(this.sloDialog, { data: this._selectedEvaluationData.data.evaluationdetails.sloFileContentParsed });
  }

  closeSloDialog() {
    if (this.sloDialogRef) {
      this.sloDialogRef.close();
    }
  }

  ngOnDestroy(): void {
    this.unsubscribe$.next();
  }

}
