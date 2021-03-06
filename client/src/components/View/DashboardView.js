/**
 *    SPDX-License-Identifier: Apache-2.0
 */

import React, { Component } from 'react';
import compose from 'recompose/compose';
import { connect } from 'react-redux';
import ChartStats from '../Charts/ChartStats';
import PeerGraph from '../Charts/PeerGraph';
import TimelineStream from '../Lists/TimelineStream';
import OrgPieChart from '../Charts/OrgPieChart';
import { getTransactionList as getTransactionListCreator } from '../../store/actions/transactions/action-creators';
import { Card, Row, Col, CardDeck, CardBody } from 'reactstrap';
import { getHeaderCount as getCountHeaderCreator } from '../../store/actions/header/action-creators';
import { getTxByOrg as getTxByOrgCreator} from '../../store/actions/charts/action-creators';
import FontAwesome from 'react-fontawesome';
class DashboardView extends Component {
    constructor(props) {
        super(props);
        this.state = {
        }
    }
    componentDidMount() {
        setInterval(() => {
            this.props.getTxByOrg(this.props.channel.currentChannel);
            this.props.getTransactionList(this.props.channel.currentChannel, 0);
        }, 60000)
    }
    render() {
        console.log("this", this.props, this.state);
        return (
        
            <div className="dashboard" >
                <div className="dash-stats">
                      <CardDeck>
                        <Card className="count-card dark-card">
                            <CardBody>
                                <h1>{this.props.countHeader.countHeader.latestBlock}</h1>
                                <h4> <FontAwesome name="cube" /> Blocks</h4>
                            </CardBody>
                        </Card>
                        <Card className="count-card light-card" >
                            <CardBody>
                                <h1>{this.props.countHeader.countHeader.txCount}</h1>
                                <h4><FontAwesome name="list-alt" /> Transactions</h4>
                            </CardBody>
                        </Card>
                        <Card className="count-card dark-card" >
                            <CardBody>
                                <h1>{this.props.countHeader.countHeader.peerCount}</h1>
                                <h4><FontAwesome name="users" />Nodes</h4>
                            </CardBody>
                        </Card>
                        <Card className="count-card light-card" >
                            <CardBody>
                                <h1>{this.props.countHeader.countHeader.chaincodeCount}</h1>
                                <h4><FontAwesome name="handshake-o" />Chaincodes</h4>
                            </CardBody>
                        </Card>
                     </CardDeck>
                </div>
                <Row>
                    <Col lg="6">
                        <ChartStats />
                    </Col>
                    <Col lg="6">
                        <OrgPieChart txByOrg={this.props.txByOrg} />
                    </Col>
                </Row>
                <Row className="lower-dash">
                    <Col lg="6">
                    <TimelineStream tansactions={this.props.transactionList}/>
                    </Col>
                    <Col lg="6">
                        <PeerGraph />
                    </Col>
                </Row>
            </div >
        );
    }
}

const mapDispatchToProps = (dispatch) => ({
    getCountHeader: (curChannel) => dispatch(getCountHeaderCreator(curChannel)),
    getTransactionList: (curChannel, offset) => dispatch(getTransactionListCreator(curChannel, offset)),
    getTxByOrg: (curChannel) => dispatch(getTxByOrgCreator(curChannel) )
});
const mapStateToProps = state => ({
    countHeader: state.countHeader,
    txByOrg : state.txByOrg.txByOrg,
    channel : state.channel.channel,
    transactionList: state.transactionList.transactionList,
});
export default compose(
    connect(mapStateToProps, mapDispatchToProps),
)(DashboardView);
