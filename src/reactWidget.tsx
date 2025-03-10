import 'flexlayout-react/style/light.css';
import Toolbar from '@mui/material/Toolbar';
import * as FlexLayout from 'flexlayout-react';
import React, { Component } from 'react';

import { JUPYTER_BUTTON_CLASS, IDict } from './utils';
import { WidgetMenu } from './menuWidget';
import { WidgetWrapper } from './widgetWrapper';
import {
  defaultModelFactoty,
  ILayoutConfig,
  updateModelEditable,
} from './defaultModelFactory';
import dialogBody from './dialogWidget';
import { showDialog } from '@jupyterlab/apputils';
import { ContextMenu } from '@lumino/widgets';
import { CommandRegistry } from '@lumino/commands';

interface IProps {
  send_msg: ({ action: string, payload: any }) => void;
  model: any;
  style: IDict;
  editable: boolean;
}

interface IState {
  model: FlexLayout.Model;
  defaultOuterModel: IDict;
  defaultModel: IDict;
  widgetList: Array<string>;
  editable: boolean;
}

export class FlexWidget extends Component<IProps, IState> {
  constructor(props: IProps) {
    super(props);
    props.model.listenTo(props.model, 'msg:custom', this.on_msg);
    this.innerlayoutRef = {};
    this.layoutConfig = props.model.get('layout_config') as ILayoutConfig;

    const { defaultOuterModel, defaultModel } = defaultModelFactoty(
      this.layoutConfig,
      props.editable
    );

    let template_json = props.model.get('template_json') as IDict;

    if (!template_json || Object.keys(template_json).length === 0) {
      template_json = defaultOuterModel;
    } else {
      template_json = updateModelEditable(template_json, props.editable);
    }

    let flexModel: FlexLayout.Model;
    try {
      flexModel = FlexLayout.Model.fromJson(template_json as any);
    } catch (e) {
      console.error(e);
      console.warn(
        'Failed to build model with saved templated, using default template.'
      );
      flexModel = FlexLayout.Model.fromJson(defaultOuterModel as any);
    }

    this.state = {
      model: flexModel,
      defaultOuterModel,
      defaultModel,
      widgetList: Object.keys(this.props.model.get('children')),
      editable: props.editable,
    };
    this.model = props.model;
    this.contextMenuCache = new Map<string, ContextMenu>();
  }

  on_msg = (data: { action: string; payload: any }, buffer: any[]): void => {
    const { action, payload } = data;
    switch (action) {
      case 'update_children':
        {
          const wName: string = payload.name;
          this.setState((old) => ({
            ...old,
            widgetList: [...old.widgetList, wName],
          }));
        }

        return null;
    }
  };
  factory = (node: FlexLayout.TabNode): JSX.Element => {
    const component = node.getComponent() as 'Widget' | 'sub';
    // const config = node.getConfig();
    const nodeId = node.getId();
    const name = node.getName();

    switch (component) {
      case 'Widget': {
        return <WidgetWrapper model={this.model} widgetName={name} />;
      }
      case 'sub': {
        return this.generateSection(node, nodeId);
      }
    }

    return null;
  };

  generateSection = (node: FlexLayout.TabNode, nodeId: string): JSX.Element => {
    let model = node.getExtraData().model;
    let defaultModel: any;
    this.innerlayoutRef[nodeId] = React.createRef<FlexLayout.Layout>();
    if (node.getConfig() && node.getConfig().model) {
      defaultModel = node.getConfig().model;
    } else {
      defaultModel = this.state.defaultModel;
    }

    if (!model) {
      node.getExtraData().model = FlexLayout.Model.fromJson(defaultModel);
      model = node.getExtraData().model;
      // save sub-model on save event
      node.setEventListener('save', (p: any) => {
        this.state.model!.doAction(
          FlexLayout.Actions.updateNodeAttributes(nodeId, {
            config: {
              model: node.getExtraData().model.toJson(),
            },
          })
        );
        //  node.getConfig().model = node.getExtraData().model.toJson();
      });
    }
    return (
      <FlexLayout.Layout
        ref={this.innerlayoutRef[nodeId]}
        classNameMapper={(className) => {
          if (className === 'flexlayout__tabset-selected') {
            className =
              'inner__flexlayout__tabset-selected flexlayout__tabset-selected';
          } else if (className === 'flexlayout__tabset') {
            className = 'inner__flexlayout__tabset flexlayout__tabset';
          } else if (className === 'flexlayout__tab') {
            className = 'inner__flexlayout__tab flexlayout__tab';
          }

          return className;
        }}
        model={model}
        factory={this.factory}
        onRenderTabSet={(
          tabSetNode: FlexLayout.TabSetNode | FlexLayout.BorderNode,
          renderValues: {
            headerContent?: React.ReactNode;
            buttons: React.ReactNode[];
          }
        ) => {
          this.onRenderTabSet(tabSetNode, renderValues, nodeId);
        }}
        onAction={(action: FlexLayout.Action) =>
          this.innerOnAction(nodeId, action)
        }
      />
    );
  };

  onAction = (action: FlexLayout.Action): FlexLayout.Action => {
    if (
      action.type === 'FlexLayout_MoveNode' ||
      action.type === 'FlexLayout_AdjustSplit' ||
      action.type === 'FlexLayout_DeleteTab' ||
      action.type === 'FlexLayout_MaximizeToggle' ||
      action.type === 'FlexLayout_SelectTab'
    ) {
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 100);
    }

    return action;
  };

  innerOnAction = (
    outerNodeID: string,
    action: FlexLayout.Action
  ): FlexLayout.Action => {
    if (
      action.type === 'FlexLayout_MoveNode' ||
      action.type === 'FlexLayout_AdjustSplit' ||
      action.type === 'FlexLayout_DeleteTab' ||
      action.type === 'FlexLayout_MaximizeToggle' ||
      action.type === 'FlexLayout_SelectTab'
    ) {
      setTimeout(() => {
        window.dispatchEvent(new Event('resize'));
      }, 100);
    }
    return action;
  };

  onRenderTabSet = (
    tabSetNode: FlexLayout.TabSetNode | FlexLayout.BorderNode,
    renderValues: {
      headerContent?: React.ReactNode;
      buttons: React.ReactNode[];
    },
    nodeId: string
  ): void => {
    if (this.state.editable) {
      const tabsetId = tabSetNode.getId();
      renderValues.buttons.push(
        <WidgetMenu
          widgetList={this.state.widgetList}
          nodeId={nodeId}
          tabsetId={tabsetId}
          addTabToTabset={(name: string) => {
            this.innerlayoutRef[nodeId].current.addTabToTabSet(tabsetId, {
              component: 'Widget',
              name: name,
              config: { layoutID: nodeId },
            });
          }}
          model={this.props.model}
        />
      );
    }
  };

  onAddRow = (): void => {
    this.layoutRef.current.addTabToActiveTabSet({
      component: 'sub',
      name: 'New section',
    });
  };

  onRenderOuterTabSet = (
    tabSetNode: FlexLayout.TabSetNode | FlexLayout.BorderNode,
    renderValues: {
      headerContent?: React.ReactNode;
      stickyButtons: React.ReactNode[];
      buttons: React.ReactNode[];
      headerButtons: React.ReactNode[];
    }
  ): void => {
    if (this.state.editable) {
      renderValues.stickyButtons.push(
        <button
          className={JUPYTER_BUTTON_CLASS}
          onClick={this.onAddRow}
          style={{
            width: '25px',
            height: '25px',
            paddingLeft: 'unset',
            paddingRight: 'unset',
            margin: 0,
          }}
        >
          <i className="fas fa-plus"></i>
        </button>
      );
    }
  };

  saveTemplate = async (): Promise<void> => {
    const oldTemplate = this.props.model.get('template');

    const result = await showDialog<string>(
      dialogBody('Save template', oldTemplate)
    );
    if (result.button.label === 'Save') {
      const fileName = result.value;
      if (fileName) {
        this.props.send_msg({
          action: 'save_template',
          payload: {
            file_name: result.value,
            json_data: this.state.model.toJson(),
          },
        });
      } else {
        alert('Invalid file name!');
      }
    }
  };

  toggleLock = (): void => {
    this.setState((old) => ({ ...old, editable: !old.editable }));
  };

  contextMenuFactory = (node: FlexLayout.Node): ContextMenu => {
    const commands = new CommandRegistry();
    const nodeId = node.getId();
    commands.addCommand('hide-tab-bar', {
      execute: () => {
        const subLayout = this.innerlayoutRef[nodeId].current;
        subLayout.props.model.doAction(
          FlexLayout.Actions.updateModelAttributes({
            tabSetEnableTabStrip: false,
          })
        );
      },
      label: 'Hide Tab Bar',
      isEnabled: () => true,
    });
    commands.addCommand('show-tab-bar', {
      execute: () => {
        const subLayout = this.innerlayoutRef[nodeId].current;
        subLayout.props.model.doAction(
          FlexLayout.Actions.updateModelAttributes({
            tabSetEnableTabStrip: true,
          })
        );
      },
      label: 'Show Tab Bar',
      isEnabled: () => true,
    });
    const contextMenu = new ContextMenu({ commands });
    contextMenu.addItem({
      command: 'show-tab-bar',
      selector: '.flexlayout__tab_button_bottom',
      rank: 0,
    });
    contextMenu.addItem({
      command: 'hide-tab-bar',
      selector: '.flexlayout__tab_button_bottom',
      rank: 1,
    });
    return contextMenu;
  };

  render(): JSX.Element {
    return (
      <div style={{ height: '510px', ...this.props.style }}>
        <div
          style={{
            width: '100%',
            height: this.state.editable ? 'calc(100% - 31px)' : '100%',
          }}
        >
          <FlexLayout.Layout
            ref={this.layoutRef}
            model={this.state.model}
            factory={this.factory}
            supportsPopout={true}
            classNameMapper={(className) => {
              if (className === 'flexlayout__layout') {
                className = 'ipyflex flexlayout__layout';
              } else if (className === 'flexlayout__tabset-selected') {
                className =
                  'outer__flexlayout__tabset-selected flexlayout__tabset-selected ';
              }
              return className;
            }}
            onAction={this.onAction}
            onRenderTabSet={(
              tabSetNode: FlexLayout.TabSetNode | FlexLayout.BorderNode,
              renderValues: {
                headerContent?: React.ReactNode;
                stickyButtons: React.ReactNode[];
                buttons: React.ReactNode[];
                headerButtons: React.ReactNode[];
              }
            ) => {
              this.onRenderOuterTabSet(tabSetNode, renderValues);
            }}
            onRenderTab={(node, _) => {
              const nodeId = node.getId();
              if (!this.contextMenuCache.has(nodeId)) {
                const contextMenu = this.contextMenuFactory(node);
                this.contextMenuCache.set(nodeId, contextMenu);
              }
            }}
            onContextMenu={(
              node:
                | FlexLayout.TabNode
                | FlexLayout.TabSetNode
                | FlexLayout.BorderNode,
              event: React.MouseEvent<HTMLElement, MouseEvent>
            ) => {
              event.preventDefault();
              event.stopPropagation();
              const contextMenu = this.contextMenuCache.get(node.getId());
              contextMenu.open(event.nativeEvent);
            }}
          />
        </div>
        {this.state.editable ? (
          <Toolbar
            variant="dense"
            style={{
              height: '30px',
              minHeight: '30px',
            }}
          >
            <button
              className={JUPYTER_BUTTON_CLASS}
              onClick={this.saveTemplate}
            >
              Save template
            </button>
          </Toolbar>
        ) : (
          <div></div>
        )}
      </div>
    );
  }

  private layoutRef = React.createRef<FlexLayout.Layout>();
  private innerlayoutRef: { [key: string]: React.RefObject<FlexLayout.Layout> };
  private model: any;
  private layoutConfig: ILayoutConfig;
  // private contextMenu: ContextMenu;
  private contextMenuCache: Map<string, ContextMenu>;
}

export default FlexWidget;
