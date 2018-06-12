/**
 *    SPDX-License-Identifier: Apache-2.0
 */

import React, { Component } from 'react';
import { Timeline, TimelineEvent } from 'react-event-timeline'
import FontAwesome from 'react-fontawesome';
// import Card, { CardContent } from 'material-ui/Card';
import { Card, CardHeader, CardBody } from 'reactstrap';
import moment from 'moment-timezone';


class TimelineStream extends Component {
    constructor(props) {
        super(props);
        this.state = {
            loading: false
        }
    }
    render() {
        console.log('tansactions', this.props.tansactions)
        return (
            <div className="activity-stream">
                <Card>
                    <CardHeader>
                        <h5>Activity</h5>
                    </CardHeader>
                    <CardBody>
                        <Timeline className="timeline">
                        {this.props.tansactions && this.props.tansactions.rows.map(function (item) {
                           return( <TimelineEvent title="Block Added"
                                createdAt= {moment(item.createdt).tz(moment.tz.guess()).format("M-D-YYYY h:mm A zz")} 
                                className="timeline-items"
                                icon={<FontAwesome name="cube" />}
                            >
                                <h6>Block {item.blockid}</h6>
                                1 Tx, datahash:{item.txhash}
                            </TimelineEvent>);
                         }) }
                        </Timeline>
                    </CardBody>
                </Card>
            </div>
        );
    }
};
export default TimelineStream;
